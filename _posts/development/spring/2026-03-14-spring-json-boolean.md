---
title: "Spring API 응답에서 boolean 필드의 is 키워드가 사라지는 이유"
date: 2026-03-14 20:00:00 +0900
categories: [Development, Spring]
tags: [Spring, Java, Jackson, Boolean, DTO]
image: /assets/img/post/spring/jackson-boolean/thumbnail.png
thumbnail_description: Spring API 응답에서 boolean 필드명을 isXXX로 형태로 작성해도, 실제로 API 응답이 반환될 때는 xXX 형태로 바뀌는 원인과 해결 방법을 정리합니다.
---

회사에서 대시보드 기능을 개발하며 API를 연동하던 중, 백엔드 개발자분과 API 명세를 협의할 때 boolean 필드는 `isPinned`, `isVisible`와 같이 `isXXX` 형태로 사용하기로 했습니다.  
그런데 막상 API를 연동해보니 응답 JSON에서 `isPinned`가 아닌 `pinned`라는 이름으로 데이터가 내려오고 있었습니다.  
백엔드 코드를 확인해보니 DTO는 분명 `isPinned`로 선언되어 있었고, 명세와 다르게 동작하고 있었습니다.  
boolean 필드에서만 이런 현상이 발생하는 원인을 찾아보게 되었고, 이 글은 그 원인과 해결 과정을 정리한 내용입니다.

## **문제 상황**
---
### **문제 재현 코드**
문제가 발생한 상황은 **<span style="background-color:yellow">스프링 API 응답에서 `boolean` primitive 타입 필드가 포함된 DTO를 사용했을 때</span>**입니다.  
문제 재현 코드는 스프링 프로젝트에서 다음과 같이 간단하게 작성했습니다.

**DashboardDto.java**
```java
@Getter
@AllArgsConstructor
@ToString
public class DashboardDto {

    private String data;
    private boolean isPinned;
}
```
**DashboardController.java**
```java
@RestController
@Slf4j
@RequestMapping("/api/dashboard")
public class DashboardController {

    @GetMapping
    public ResponseEntity<DashboardDto> getData() {
        DashboardDto dto = new DashboardDto("테스트", true);
        log.info("[DashboardController] 응답 데이터: {}", dto);
        return ResponseEntity.ok(dto);
    }
}
```

### **API 요청 및 응답 결과**
이제 GET API를 호출했습니다.
```bash
curl -X GET http://localhost:8080/api/dashboard
```

결과를 확인해보니 다음과 같이 `is` 키워드가 사라지고 `pinned`라는 이름으로 반환되고 있었습니다.
```json
{
    "data": "테스트",
    "pinned": true
}
```

그러나 서버 로그를 확인해보면 DTO의 `toString()`에서는 `isPinned`로 출력되고 있습니다.  
<img src="/assets/img/post/spring/jackson-boolean/api-response-log.png" alt="Api Response Log" style="max-width: 100%; height: auto;">

## **원인 분석**
---
`is` 키워드가 사라지는 현상에는 다음 두 가지가 영향을 미칩니다.
1. **<span style="background-color:yellow">Java Bean Convention에 따라 boolean primitive 필드는 getter가 생성될 때 `is` 키워드가 붙는다.</span>**
  - 해당 내용은 Oracle 문서에서도 확인할 수 있습니다.
  > A special case for boolean properties allows the accessor method to be defined using is instead of get.  
  > <div>출처 : <a href="https://docs.oracle.com/javase/tutorial/javabeans/writing/properties.html" target="_blank">Oracle Java Tutorials - JavaBeans Properties</a></div>
  - **단, 필드명이 이미 `is` + 대문자 형태이면 `is`를 중복으로 붙이지 않고 필드명을 getter 이름으로 그대로 사용합니다.**
```java
private boolean pinned;    // ==> isPinned()    is 붙임
private boolean isPinned;  // ==> isPinned()    이미 is+대문자 → 그대로 사용
private boolean isok;      // ==> isIsok()      is 다음이 소문자 → is 붙임
```
2. **<span style="background-color:yellow">Jackson은 필드가 아닌 객체의 getter 이름을 파싱해서 JSON 키를 결정한다.</span>**  
  - Jackson이 **getXXX()** getter를 JSON 키로 변환하는 과정은 다음과 같습니다.
  <img src="/assets/img/post/spring/jackson-boolean/getter-convert.png" alt="Getter to JSON Key Conversion" style="max-width: 100%; height: auto;">
  - **isXXX()**도 getter와 동일한 방식으로 처리되기 때문에, `is`가 제거된 이름이 JSON 키가 됩니다.

두 가지를 종합하면, `boolean` 타입의 `isPinned` 필드는 Java Bean Convention에 의해 필드명을 그대로 사용해 `isPinned()` getter로 생성됩니다.  
이후 Jackson이 JSON을 직렬화할 때 getter 이름에서 `is`를 제거하기 때문에, DTO에서는 `isPinned`로 선언했더라도 실제 응답에서는 `pinned`로 반환되는 것입니다.

## **해결 방안**
---
### **1. `@JsonProperty` 사용**
가장 먼저 시도한 방법은 필드에 `@JsonProperty`를 선언하는 것입니다.

```java
@Getter
@AllArgsConstructor
@ToString
public class DashboardDto {

    private String data;

    @JsonProperty("isPinned")
    private boolean isPinned;
}
```

결과를 확인해보면 `isPinned`가 반환되기는 했지만, 기존의 `pinned`도 함께 반환되고 있었습니다.

```json
{
    "data": "테스트",
    "isPinned": true,
    "pinned": true
}
```

이는 `@JsonProperty("isPinned")`가 **필드 레벨**에 `isPinned` 프로퍼티를 등록하고, Lombok이 생성한 `isPinned()` getter도 여전히 `pinned` 프로퍼티로 등록되면서 **두 프로퍼티가 공존**하기 때문입니다.  

#### **pinned와 isPinned가 모두 반환되는 문제 해결: @JsonIgnore 사용**
`pinned` 프로퍼티는 반환되지 않게 하고 싶다면, `isPinned()` getter에 `@JsonIgnore`를 적용하면 됩니다.  
그러면 Jackson이 해당 getter를 무시하기 때문에 `pinned` 프로퍼티가 등록되지 않습니다. 
```java
@Getter
@AllArgsConstructor
@ToString
public class DashboardDto {

    private String data;

    @JsonProperty("isPinned")
    private boolean isPinned;

    @JsonIgnore
    public boolean isPinned() {
        return isPinned;
    }
}
```

응답 값을 보면 `isPinned`만 남는 것을 확인할 수 있습니다.  
```json
{
    "data": "테스트",
    "isPinned": true
}
```
하지만 이 방법은 `@JsonProperty`, `@JsonIgnore`, `Getter 메서드 직접 선언` 등 번거로운 작업이 많아집니다.

### **2. `Boolean` 래퍼 타입 사용**
`boolean` primitive를 `Boolean` 래퍼 타입으로 변경하는 것이 가장 간단한 해결 방법입니다.  
`Boolean` 래퍼 타입은 Java Bean Convention에서 **일반 타입**으로 취급되어, Lombok `@Getter`가 `is` 대신 `get` 키워드를 붙인 `getIsPinned()` 메서드를 생성합니다.

| 타입 | 생성되는 getter | JSON 키 |
|------|----------------|---------|
| `boolean isPinned` | `isPinned()` | `pinned` ← 문제 |
| `Boolean isPinned` | `getIsPinned()` | `isPinned` ← 정상 |

다음과 같이 `boolean` 타입을 `Boolean`으로 변경하면 됩니다.
```java
@Getter
@AllArgsConstructor
@ToString
public class DashboardDto {

    private String data;
    private Boolean isPinned;
}
```

Jackson은 `getIsPinned()` getter에서 `get`을 제거하고 첫 글자를 소문자로 변환하여 `isPinned`를 JSON 키로 사용하기 때문에 의도한 대로 반환됩니다.
```json
{
    "data": "테스트",
    "isPinned": true
}
```

#### **Boolean 타입 사용 시 주의사항**
primitive 타입과 다르게 래퍼 타입은 `true`, `false` 외에 `null` 값이 될 수도 있습니다.  
`null` 체크 없이 사용하면 `NullPointerException`이 발생하므로, `null` 체크 로직을 추가해야 합니다.

```java
Boolean isPinned = null;

// NullPointerException 발생
if (isPinned) { ... }

// null 체크 후 사용
if (Boolean.TRUE.equals(isPinned)) { ... }
```

### **3. 직접 getter 정의**
Jackson은 `isXXX()` getter에서 `is`를 제거하지만, `getXXX()` getter에서는 `get`만 제거하고 나머지를 그대로 JSON 키로 사용합니다.  
따라서 `boolean` 필드에 대한 getter 생성을 Lombok에 의존하지 않고, 직접 `getXXX()` 형태의 getter를 정의하여 문제를 해결할 수도 있습니다.  
`@Getter(AccessLevel.NONE)`을 해당 필드에 지정하고, 해당 필드에 대한 getter를 직접 선언하면 됩니다.  
Jackson이 `getIsPinned()` getter를 인식해 `get`을 제거하고 첫 글자를 소문자로 변환하기 때문에, `isPinned`가 JSON 키로 정상 반환됩니다.

```java
@Getter
@AllArgsConstructor
@ToString
public class DashboardDto {

    private String data;

    @Getter(AccessLevel.NONE)   // 해당 필드의 Lombok getter 생성 억제
    private boolean isPinned;

    public boolean getIsPinned() {
        return isPinned;
    }
}
```

다만 이 방식은 필드가 많아지면 그에 따라 직접 선언한 getter 메서드도 많아져 코드가 길어집니다.

## **정리**
---
세 가지 해결 방법을 간단히 표로 정리하면 다음과 같습니다.

| 방법 | 단점 |
|------|------|
| `@JsonProperty` + `@JsonIgnore` | 번거로운 작업이 많음 |
| `Boolean` 래퍼 타입 | `null` 주의 필요 |
| `@Getter(AccessLevel.NONE)` + getter 직접 선언 | 필드가 많으면 코드가 길어짐 |

저는 코드 변경이 가장 적고 간단한 **`Boolean` 래퍼 타입으로 변경**하여 문제를 해결했습니다.  
다만 `Boolean` 래퍼 타입은 `null`이 될 수 있으므로, 서비스 로직에서 `Boolean.TRUE.equals(value)`와 같이 null-safe한 방식으로 사용하는 것을 권장합니다.  


##### **참고: Java `record` 사용 시**  
> Java 16+의 `record`를 사용하면 해당 문제가 발생하지 않습니다.  
> `record`는 JavaBean getter(`isXXX()`) 대신 컴포넌트 이름을 그대로 접근자로 사용하기 때문에, Jackson이 `is`를 제거하지 않고 필드명을 그대로 JSON 키로 사용합니다.
> ```java
> public record DashboardDto(String data, boolean isPinned) {}
> // JSON 키: "isPinned" ✅
> ```