---
title: "스프링 @RequestBody에 자동으로 @PathVariable 주입하기"
date: 2025-09-27 20:00:00 +0900
categories: [Development, Spring]
tags: [Spring, Spring MVC]
image: /assets/img/post/spring/icon.png
thumbnail_description: 커스텀 애노테이션 @InjectPathVariable을 개발하고, 이를 활용하여 컨트롤러 메서드를 깔끔하게 작성하는 방법을 공유합니다.
---

REST API를 개발할 때, 스프링에서는 다양한 데이터 바인딩 애노테이션을 활용하여 요청값을 쉽게 컨트롤러에 주입할 수 있습니다.  
대표적으로 다음과 같은 애노테이션이 있습니다.  
- `@PathVariable` : URL 경로에 포함된 값을 변수로 바인딩
- `@RequestParam` : 폼 데이터나 쿼리 파라미터를 변수로 바인딩
- `@RequestBody` : HTTP 요청 본문을 객체로 바인딩
- `@ModelAttribute` : 폼 데이터나 쿼리 파라미터를 객체로 바인딩

저는 주로 요청 전용 DTO 객체를 만들어 사용하기 때문에, `GET` 요청에서는 `@ModelAttribute`, `POST` 요청에서는 `@RequestBody`를 통해 데이터를 바인딩합니다.  

`@ModelAttribute`는 폼 데이터 뿐만 아니라 **URL 경로의 변수**도 자동으로 바인딩해 줍니다.  
반면, `@RequestBody`는 HTTP 요청 본문만 바인딩하기 때문에, URL 경로의 값을 컨트롤러에서 Setter로 직접 바인딩하거나 서비스 레이어에 별도로 전달해야 하는 불편함이 있었습니다.  

그래서 `@RequestBody`에도 `@PathVariable` 값을 자동으로 주입해주는 커스텀 애노테이션 `@InjectPathVariable`을 구현해보고, 그 내용을 공유하고자 합니다.

<br/>

## **목차**
 - 배경
    - 기존 @RequestBody + @PathVariable 사용 방식
    - 목표: @InjectPathVariable 커스텀 애노테이션
 - 구현 방법
    - @InjectPathVariable
    - PathVariableInjectionAdvice
    - 동작 확인
 - 결론

<br/>


## **배경**
---

### **기존 @RequestBody + @PathVariable 사용 방식**
저는 그동안 `POST` 요청 API를 개발할 때 다음과 같이 코드를 작성했습니다.  
```java
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class XXXController {

	private final XXXService xxxService;

	// 1. 서비스 레이어에 전달하기 전 직접 객체에 데이터 바인딩
	@PostMapping("/{id}")
	public ResponseEntity<String> testApi(@RequestBody RequestDto requestDto, @PathVariable Integer id) {
		requestDto.setId(id);
		xxxService.call(requestDto);
		return ResponseEntity.ok("ok");
	}

	// 2. 서비스 레이어에 DTO 객체와 PathVariable 변수를 함께 전달
	@PostMapping("/{id}/v2")
	public ResponseEntity<String> testApi2(@RequestBody RequestDto requestDto, @PathVariable Integer id) {
		xxxService.call2(id, requestDto);
		return ResponseEntity.ok("ok");
	}

	@Data
	public static class RequestDto {

		private Integer id;
		private String name;
		private int age;
	}
}
```
요청 예시
```bash
curl -X POST http://localhost:8080/api/1234 \ 
     -H "Content-Type: application/json" \ 
     -d '{"name":"hspear","age":55}'
```

하지만 이 방식에는 몇 가지 불편함이 있습니다.
1. **수동 바인딩 필요**
- 컨트롤러마다 반복적으로 `@PathVariable` 값을 DTO에 주입하는 보일러플레이트 코드가 발생합니다.
2. **DTO 불변성 훼손**
  - 수동 주입을 위해 Setter가 열려 있어야 하므로, DTO 객체의 불변성이 깨질 수 있습니다.
  - DTO는 데이터를 전달하기 위한 객체이므로 반드시 Setter가 없어야 하는 것은 아니지만,   
  불변 객체로 설계하는 것은 데이터 일관성 유지나 안전성 등에서 좋은 설계라고 생각합니다.

### **목표: @InjectPathVariable 커스텀 애노테이션**

기존의 수동 바인딩의 불편함을 개선하고자, `@InjectPathVariable`이라는 커스텀 애노테이션을 개발해보고자 합니다.  
이 애노테이션은 DTO 객체 내부 필드에 선언하여, 해당 필드에 `@PathVariable` 값이 자동으로 주입되도록 할 것입니다.

```java
@Data
public static class RequestDto {

  @InjectPathVariable
  private Integer id;

  private String name;
  private int age;
}
```

<br/>

## **구현 방법**
---

### **@InjectPathVariable**
`@InjectPathVariable`은 다음과 같이 작성했습니다.
```java
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
public @interface InjectPathVariable {

	String name() default "";
	boolean required() default true;
}
```
- **Line1**:
  - 애노테이션이 클래스의 필드에만 사용할 수 있도록 ElementType.FIELD로 지정합니다.
  - 즉, 메서드, 클래스, 매개변수에는 적용할 수 없습니다.
- **Line2**: 
  - 애노테이션 정보를 컴파일 이후 런타임 시점에도 참조할 수 있도록 합니다.
  - 리플렉션을 이용해 실행 중에 해당 애노테이션 정보를 조회하고 활용할 수 있습니다.
- **Line5**: 주입할 `@PathVariable` 이름을 지정하는 속성으로, 지정하지 않으면 빈 문자열로 처리합니다.
- **Line6**: 변수 주입이 필수로 할지 여부를 설정하는 속성으로, 기본 값은 `true`로 처리합니다.

### **PathVariableInjectionAdvice**

이제 앞서 만든 `@InjectPathVariable` 애노테이션이 동작하도록 Advice를 개발합니다.  

클래스 레벨에 `@RestControllerAdvice`를 선언해 Spring MVC 컨트롤러 전역에 적용되도록 하며, `RequestBodyAdvice` 인터페이스를 구현해 `@RequestBody` 바인딩 과정에 개입할 수 있도록 합니다.  
```java
@RestControllerAdvice
public class PathVariableInjectionAdvice implements RequestBodyAdvice {
    // ...
}
```



`RequestBodyAdvice` 인터페이스는 4개의 메서드로 구성되며, 각 메서드의 역할은 다음과 같습니다.
```java
package org.springframework.web.servlet.mvc.method.annotation;

import java.io.IOException;
import java.lang.reflect.Type;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.lang.Nullable;

public interface RequestBodyAdvice {
  
    /**
     * 해당 Advice가 적용될지 여부를 결정하는 메서드
     */
    boolean supports(MethodParameter methodParameter, Type targetType, 
      Class<? extends HttpMessageConverter<?>> converterType);

    /**
     * 요청의 본문을 읽기 전에 호출되어, 본문 데이터를 가로채거나 변환할 수 있는 메서드
     */
    HttpInputMessage beforeBodyRead(HttpInputMessage inputMessage, MethodParameter parameter,
      Type targetType, Class<? extends HttpMessageConverter<?>> converterType) throws IOException;

    /**
     * 요청 본문이 객체로 변환된 후 호출
     * 변환된 객체를 추가로 수정하거나, 필드 값을 조작하는 후처리 작업에 사용
     */
    Object afterBodyRead(Object body, HttpInputMessage inputMessage, MethodParameter parameter,
      Type targetType, Class<? extends HttpMessageConverter<?>> converterType);

    /**
     * 요청의 본문이 비어있을 경우 호출
     * 빈 본문에 대한 기본 값을 커스터마이징할 때 사용
     * 이후 beforeBodyRead, afterBodyRead는 호출되지 않음
     */
    @Nullable
    Object handleEmptyBody(@Nullable Object body, HttpInputMessage inputMessage, 
      MethodParameter parameter, Type targetType, 
      Class<? extends HttpMessageConverter<?>> converterType);
}
```
참고로 각 메서드의 호출 순서는 다음과 같습니다.
- 본문이 있을 경우: `supports` → `beforeBodyRead` → 본문 읽기 → `afterBodyRead`
- 본문이 없을 경우: `supports` → `handleEmptyBody`

#### **supports() 메서드 구현**
`PathVariableInjectionAdvice`가 적용될 대상은 다음과 같이 정의합니다.  
- 컨트롤러 메서드에 선언된 객체 내 필드 중 `@InjectPathVariable`가 붙어 있는 필드가 1개 이상 존재하는 경우

그러기 위해서 `supports()` 메서드는 컨트롤러 메서드에 선언된 객체의 필드들을 순회하면서,  
필드 중에 `@InjectPathVariable` 애노테이션이 붙은 필드가 하나라도 있으면 `true`를 반환하도록 구현했습니다.

```java
@Override
public boolean supports(MethodParameter methodParameter, Type targetType,
	Class<? extends HttpMessageConverter<?>> converterType) {
	
	Class<?> clazz = methodParameter.getParameterType();
	return Arrays.stream(clazz.getDeclaredFields())
		.anyMatch(field -> field.isAnnotationPresent(InjectPathVariable.class));
}
```

#### **afterBodyRead() 메서드 구현**
`PathVariableInjectionAdvice`의 핵심이 되는 부분입니다.  
```java
private final ConversionService conversionService;

@Override
public Object afterBodyRead(Object body, HttpInputMessage inputMessage, MethodParameter parameter,
	Type targetType, Class<? extends HttpMessageConverter<?>> converterType) {

	HttpServletRequest httpServletRequest = getHttpServletRequest();
	Map<String, String> pathVariables = getPathVariables(httpServletRequest);
	injectPathVariables(body, pathVariables);

	return body;
}

/**
 * 객체(target) 내의 필드를 순회하며, PathVariable에 해당하는 값을 주입
 */
private void injectPathVariables(Object target, Map<String, String> pathVariables) {
	if (target == null)
		return;

	Arrays.stream(target.getClass().getDeclaredFields())
		.filter(field -> field.isAnnotationPresent(InjectPathVariable.class))
		.forEach(field -> injectPathVariable(target, field, pathVariables));
}

/**
 * 핵심 로직
 * 1. name 속성으로 주입할 변수 이름을 확인
 *    속성 값이 지정되지 않았다면 필드명을 기본 name으로 사용
 * 2. PathVariable 변수 중에 name에 해당하는 값이 없고, required가 true라면 예외 발생
 * 3. PathVariable 변수 타입 체크 및 변환
 * 4. 리플렉션으로 필드에 값 주입
 */
private void injectPathVariable(Object body, Field field, Map<String, String> pathVariables) {
	InjectPathVariable annotation = field.getAnnotation(InjectPathVariable.class);

	String name = annotation.name().isEmpty() ? field.getName() : annotation.name();
	boolean required = annotation.required();

	if (!pathVariables.containsKey(name)) {
		if (required) {
			throw new IllegalArgumentException(String.format("Path variable '%s' is required.", name));
		}
		return;
	}

	Object value = conversionService.convert(pathVariables.get(name), field.getType());

	ReflectionUtils.makeAccessible(field);
	ReflectionUtils.setField(field, body, value);
}

/**
 * afterBodyRead() 메서드는 HttpServletRequest가 제공되지 않으므로,
 * RequestContextHolder를 활용해 현재 스레드의 HTTP 요청 객체를 반환
 */
private HttpServletRequest getHttpServletRequest() {
	RequestAttributes requestAttributes = RequestContextHolder.currentRequestAttributes();
	return ((ServletRequestAttributes) requestAttributes).getRequest();
}

/**
 * HttpServletRequest에 저장된 URL 경로 변수의 key-value 맵을 추출하여 반환
 */
@SuppressWarnings("unchecked")
private Map<String,String> getPathVariables(HttpServletRequest httpServletRequest) {
	return (Map<String, String>) httpServletRequest.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
}
```

#### **beforeBodyRead(), handleEmptyBody() 메서드 구현**
객체가 만들어지기 전과 요청의 본문이 비어있을 때에는 따로 처리할 부분이 없기 때문에 그대로 반환되도록 하면 됩니다.

```java
@Override
public HttpInputMessage beforeBodyRead(HttpInputMessage inputMessage, MethodParameter parameter,
	Type targetType, Class<? extends HttpMessageConverter<?>> converterType) throws IOException {
	return inputMessage;
}

@Override
public Object handleEmptyBody(Object body, HttpInputMessage inputMessage, 
	MethodParameter parameter, Type targetType,
	Class<? extends HttpMessageConverter<?>> converterType) {
		
	return body;
}
```

### **동작 확인**
이제 구현을 마쳤으니 실제 동작을 확인해보겠습니다.  
`RequestDto`의 `id` 필드는 `@InjectPathVariable` 애노테이션을 붙여, URL 경로 변수 값이 자동으로 주입되도록 했습니다.  
이로 인해 컨트롤러 메서드에서는 별도로 `@PathVariable` 변수를 선언하거나 `setId()` 메서드를 호출할 필요가 없습니다.

```java
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class XXXController {

	private final XXXService xxxService;

	@PostMapping("/{id}")
	public ResponseEntity<String> testApi(@RequestBody RequestDto requestDto) {
		// requestDto.setId(id);
		xxxService.call(requestDto);
		return ResponseEntity.ok("ok");
	}

	@Data
	public static class RequestDto {

		@InjectPathVariable
		private Integer id;
		
		private String name;
		private int age;
	}
}

@Slf4j
@Service
public class XXXService {

	void call(XXXController.RequestDto requestDto) {
		log.info("requestDto.id={}", requestDto.getId());
		log.info("requestDto.name={}", requestDto.getName());
		log.info("requestDto.age={}", requestDto.getAge());
	}
}
```

다음과 같은 요청을 실행하면,
```bash
curl -X POST http://localhost:8080/api/1234 \ 
     -H "Content-Type: application/json" \ 
     -d '{"name":"hspear","age":55}'
```

XXXService에서 다음과 같은 로그가 발생하는 것을 확인할 수 있습니다.  
요청 본문에 `id` 값을 별도로 명시하지 않아도 경로 변수 `id` 값이 정상적으로 주입된 것을 확인할 수 있습니다.  
```
[nio-8080-exec-1] c.p.s.d.product.controller.XXXService    : requestDto.id=1234
[nio-8080-exec-1] c.p.s.d.product.controller.XXXService    : requestDto.name=hspear
[nio-8080-exec-1] c.p.s.d.product.controller.XXXService    : requestDto.age=55
```

JUnit으로 컨트롤러 테스트 코드도 작성해서 실행해 보았습니다.  
<img src="/assets/img/post/spring/request-data-binding/unit-test-result.png" alt="Unit Test" style="max-width: 100%; height: auto;">

<br/>

## **결론**
--- 
커스텀한 `@InjectPathVariable` 애노테이션을 활용하여 **수동으로 경로 변수 값을 바인딩하는 반복 작업을 줄이고, 컨트롤러 메서드를 훨씬 깔끔하게 작성할 수 있었습니다.**  
또한, 리플렉션을 통해 직접 필드에 값을 주입하기 때문에, 별도의 Setter 메서드를 호출할 필요가 없어 **DTO 객체의 불변성을 유지**할 수 있는 장점도 있습니다.  

**<span style="background-color:pink">다만, 이 방식은 기존에 명시적으로 작성하던 바인딩 로직을 암묵적으로 처리하게 되므로, 팀원 간 충분한 사전 협의가 없으면 코드 이해와 유지보수가 어려워질 수 있다고 생각합니다.</span>**  
**<span style="background-color:pink">또한, 리플렉션 기반 주입은 런타임에 동적으로 동작하기 때문에, 일반적인 메서드 호출에 비해 성능이 저하될 수 있습니다.</span>**  

이번 포스팅에서는 `@InjectPathVariable` 커스텀 애노테이션을 개발하는 과정을 다뤘으며, 개인적으로는 `POST` 요청 API에서 `@RequestBody`와 `@PathVariable`을 함께 사용하는 경우가 많아 이 기능을 만들게 되었습니다.  
만약 `@RequestParam`같은 다른 바인딩 애노테이션도 `@RequestBody`와 함께 사용하는 경우가 있다면, 이를 자동으로 바인딩하도록 기능을 확장하는 것도 고려할 수 있을 것입니다.

또한, Java의 불변 데이터 구조인 `record`는 **final 필드**를 사용하며, 이는 리플렉션을 통한 **일반적인 필드 주입 방식으로는 값을 변경할 수 없습니다.**  
그렇기 때문에 현재 구조로는 record DTO에 데이터 바인딩 기능을 활용할 수 없고, 좀 더 개선이 필요합니다.


> 이번 포스팅에서 작성한 코드는 여기에서 확인할 수 있습니다.
-   <img src="https://github.githubassets.com/assets/pinned-octocat-093da3e6fa40.svg" width="20" height="20"/> [[Github Repository] spring-request-data-binding](https://github.com/h-spear/spring-request-data-binding){:target='_blank'}