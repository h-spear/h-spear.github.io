---
title: "토이 프로젝트에서 놓쳤던 백엔드 보안 3가지"
date: 2026-05-01 20:00:00 +0900
categories: [Development, Backend]
tags: [Spring, Backend, Security, Pretty POP]
image: /assets/img/post/backend/security/security-elements.png
thumbnail_description: IDOR 취약점, 개인정보 컬럼 암호화, API Rate Limiting 등 그동안 토이 프로젝트에서 놓쳤던 보안 취약점을 보완하며 새롭게 알게 된 내용을 정리합니다. 
---

SSAFY나 개인 토이 프로젝트를 통해 백엔드를 여러 번 구현해봤지만, 대부분은 "기능이 동작하는 것"에 초점을 맞추는 경우가 많았습니다.  
실제 서비스로 배포하는 상황을 가정하고, 보안적인 문제까지 깊이 있게 고려해본 경험은 부족했던 것 같습니다.  

최근에는 AI를 활용해 개발 속도를 크게 끌어올리고, 기능 구현 자체도 훨씬 수월해지면서 오히려 보안의 중요성을 더 크게 느끼게 되었습니다.  
과거 취업 준비 당시 스프링을 공부하며 만들었던 쇼핑몰 프로젝트 **예쁜피오피**를 3년 만에 다시 꺼내 실제 서비스로 배포한다는 가정하에 새롭게 개발해보기로 했습니다.  

특히 AI의 도움을 받아 그동안 신경쓰지 못했던 보안 요소들까지 고려하며 개발하게 되었고, 그 과정에서 새롭게 알게 된 내용들을 정리해보려고 합니다.

<br/>

## **목차**

1. 엔티티 PK Auto Increment의 보안 취약점
  - IDOR 취약점
  - 프로젝트에서의 판단
2. 개인정보 컬럼 암호화
  - 조회가 필요한 값: 양방향 암호화
  - 조회가 필요 없는 값: 단방향 해시
3. API Rate Limiting
  - 토큰 버킷 알고리즘(Token Bucket Algorithm)
  - 구현
  - 엔드포인트별 차등 제한

<br/>

## **1. 엔티티 PK Auto Increment의 보안 취약점**
  
---

저는 지금까지 스프링과 JPA로 개발을 하면서 습관적으로 모든 엔티티의 PK(기본키)를 다음과 같이 설정해 왔습니다.  
```java
@Table(name = "orders")
@Entity
@Getter
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "order_id")
    private Long id;

    // fields...
}
```

여기서 `@GeneratedValue(strategy = GenerationType.IDENTITY)`는 기본키(PK) 생성을 **데이터베이스에 온전히 위임하는 설정**입니다.  

저는 주로 MySQL이나 MariaDB를 사용해 왔기 때문에, 자연스럽게 데이터베이스의 `AUTO_INCREMENT` 기능을 통해 PK가 생성되었습니다. 
새로운 데이터가 추가될 때마다 `1, 2, 3...` 순차적으로 번호가 매겨지는 방식입니다.  

하지만 이처럼 단순한 순차적 숫자를 PK로 외부에 노출할 경우, 보안적인 취약점으로 이어질 수 있습니다.  

### **IDOR 취약점**

순차적인 숫자 ID가 URL에 그대로 노출되면, 공격자가 ID 값을 1씩 증가시키며 다른 사용자의 데이터에 접근을 시도할 수 있습니다.  

```
GET /api/orders/1   ← 내 주문 정보
GET /api/orders/2   ← 다른 사람의 주문 정보?
GET /api/orders/3   ← 또 다른 사람의 주문 정보?
```

이를 **IDOR(Insecure Direct Object Reference)** 취약점이라고 합니다.
만약 서버 측에 사용자의 권한을 검증하는 접근 제어 로직이 한 곳이라도 빠져 있으면, 예측 가능한 ID로 인해 서비스의 전체 데이터가 노출될 수 있습니다.  

> IDOR은 애플리케이션이 사용자가 입력한 값을 기반으로 객체에 직접 접근을 허용할 때 발생합니다.  
> 이 취약점으로 인해 공격자는 인가(권한 확인)를 우회하여 DB 레코드나 파일과 같은 시스템 내 리소스에 직접 접근할 수 있습니다.
> 
> 출처 : [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References){:target='_blank'}

추가로 **비즈니스 정보 유출** 문제도 간과할 수 없습니다.
예를 들어 주문번호가 `1000`번이면 총 주문량이 1000건이라는 사실이 외부에 그대로 드러나게 됩니다.


### **프로젝트에서의 판단**

IDOR 취약점 문제를 해결하기 위해, **엔티티의 성격**과 **"해당 ID가 클라이언트(외부)에 노출되는가?"**를 기준으로 ID 방식을 고민하게 되었습니다.  
크게 **주문, 상품, 유저** 엔티티로 나누어 제가 판단한 기준과 적용 과정을 설명하겠습니다.  


#### **1) 주문(Order): <span style="background-color: yellow;">외부 노출용 식별자 도입</span>**

주문 정보는 주문 내역 조회, 배송 조회 등 자주 노출되기 때문에, 외부에서 예측할 수 없는 식별자가 필요하다고 판단했습니다.  
외부 노출용 식별자는 다음과 같이 생성했습니다. (하나의 예시로 비즈니스에 맞게 여러 방법이 있을 수 있습니다.)

```java
// OrderNumberGenerator.java
public String generateOrderNumber() {
    return String.format("%s-%s-%s",
        ORDER_NUMBER_PREFIX,       // "ORD"
        getTodayDateString(),      // "20260425"
        generateRandomString()     // SecureRandom 기반 5자리 난수
    );
}
// 결과 예시: ORD-20260425-A3F8B
```
날짜를 포함해서 관리자가 정렬하거나 조회하기 편하도록 했고, `SecureRandom`을 사용해 예측 불가능한 난수를 뒤에 붙이는 방식으로 구성했습니다.  

그리고 **Order** 엔티티에는 `orderNumber`필드(외부 노출용 식별자)를 추가했습니다.

```java
@Table(name = "orders")
@Entity
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "order_id")
    private Long id;

    @Column(unique = true, nullable = false, length = 30)
    private String orderNumber;    // OrderNumberGenerator가 생성한 문자열이 들어감

    // fields...
}
```

실제 DB의 PK는 기존과 동일하게 `AUTO_INCREMENT` 방식을 유지했습니다.  
외부에 노출되는 API 응답 DTO나 요청 Parameter에는 orderNumber를 사용함으로써, PK가 클라이언트에 직접 노출되지 않도록 했습니다.  

예시로 Order 관련 응답 DTO는 다음과 같습니다.  

```java
public record OrderSearchResponse(
    String orderNumber,     // id는 포함하지 않고, orderNumber만 반환
    OrderStatus orderStatus,
    ...
) {
}
```

#### **2) 상품(Product): <span style="background-color: yellow;">Sequential (Auto Increment) 유지</span>**

상품 정보는 누구나 볼 수 있는 **공개 데이터**입니다. 순차적인 ID가 노출되더라도 공격자가 얻을 수 있는 정보가 없습니다.  
따라서 기존과 동일하게 `AUTO_INCREMENT` 방식을 유지했습니다.  

```java
@Entity
public class Product extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "product_id")
    private Long id;

    // 외부 식별자 사용 안 함 (id 그대로 노출)
    // fields...
}
```

#### **3) 유저(User): <span style="background-color: yellow;">Sequential (Auto Increment) 유지</span>**

유저 ID는 상품과 마찬가지로 기존 `AUTO_INCREMENT`를 유지했습니다.  

해당 프로젝트에서는 JWT 방식으로 인증을 처리했습니다. JWT를 디코딩하면 payload에 담긴 `userId`가 노출될 수 있지만, 서버는 클라이언트로부터 `userId`를 직접 받지 않고 **토큰을 검증**한 뒤 서버가 직접 꺼내서 사용합니다.  
따라서 공격자가 `userId`를 알아내더라도 값을 조작해 다른 사용자의 데이터에 접근하는 것이 불가능합니다. 

```java
// @LoginUser: JWT 토큰에서 서버가 직접 userId를 꺼냄
// 클라이언트가 userId를 조작할 수 없음
@GetMapping("/my-orders")
public ResponseEntity<?> getMyOrders(@LoginUser Long userId) {
    return ApiResponse.builder()
        .data(orderService.searchOrders(userId, condition, pageable))
        .buildSuccess();
}
```

클라이언트가 URL이나 파라미터로 `userId`를 직접 전달할 일이 없기 때문에, 별도의 외부 식별자를 도입하지 않았습니다. 

> 물론 JWT Secret이 탈취될 경우, 공격자가 임의의 ID로 토큰을 위조할 수 있어 IDOR 취약점에 노출될 위험이 있습니다.  
> 따라서 환경 변수 분리, 키 로테이션 등 철저한 Secret 키 관리가 전제되어야 합니다.

<br/>

## **2. 개인정보 컬럼 암호화**

---

토이 프로젝트에서도 개인정보(이름, 전화번호, 이메일 등)를 평문으로 저장하는 경우가 많습니다.  
DB 접근 권한만 있으면 누구나 데이터를 그대로 읽을 수 있어, 실제 서비스에서는 보안 문제로 이어질 수 있습니다.  

예쁜피오피에서는 이를 방지하기 위해 **컬럼 단위 암호화**를 적용했습니다.

|컬럼|암호화 방식|이유|
|---|---|---|
|이름, 전화번호, 이메일, 주소|양방향 암호화|화면에 복호화해서 표시해야 함|
|소셜 로그인 ID(socialId)|단방향 해시|식별에만 사용, 원본값 불필요|


### **조회가 필요한 값: <span style="background-color: yellow;">양방향 암호화</span>**

이름, 전화번호, 주소처럼 화면에 보여줘야 하는 값은 DB에는 암호화하여 저장하되, 나중에 화면에 표시하기 위해 복호화가 가능해야 합니다.  
이를 위해 JPA의 `@Convert` 애노테이션을 활용하여 엔티티 레벨에서 자동으로 암/복호화가 이루어지도록 했습니다.

```java
@Table(name = "users")
@Entity
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long id;

    @Column(nullable = false, length = 500)
    @Convert(converter = AesEncryptConverter.class)
    private String email;

    @Convert(converter = AesEncryptConverter.class)
    private String name;

    @Convert(converter = AesEncryptConverter.class)
    private String phoneNumber;
}
```

이렇게 `@Convert` 애노테이션을 필드에 붙이는 것만으로, DB에 저장할 때는 자동으로 암호화가 진행되고, 조회할 때는 원본 데이터로 복호화됩니다.  
비즈니스 로직에서는 암호화 로직을 전혀 신경 쓰지 않고 개발할 수 있습니다.  

실제 변환 로직은 `AttributeConverter` 인터페이스를 구현한 `AesEncryptConverter` 클래스가 담당합니다.  
**`convertToDatabaseColumn`**에서 암호화, **`convertToEntityAttribute`**에서 복호화를 처리합니다.

```java
@Converter
public class AesEncryptConverter implements AttributeConverter<String, String> {

    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null) return null;
        return CryptoUtils.encrypt(attribute); // 저장 시 암호화 (AES-256 GCM 등)
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;
        return CryptoUtils.decrypt(dbData);    // 조회 시 복호화
    }
}
```

#### **검색 문제와 해결책 (해시 컬럼 도입)**
단, 양방향 암호화를 적용하면 암호화된 값은 `WHERE email = ?` 같은 일반적인 쿼리로 검색할 수 없게 됩니다. 매번 암호화할 때마다 결과값이 달라져 DB 레벨에서 직접 비교가 불가능하기 때문입니다.  

이를 해결하기 위해 검색에 사용되는 컬럼은 **별도의 `검색용 해시값`을 저장하는 컬럼을 만들고 인덱싱**하는 방식을 사용했습니다.  

```
users 테이블
├── email         VARCHAR(500)  -- AES-256으로 암호화
├── name          VARCHAR(500)  -- AES-256으로 암호화
├── name_hash     VARCHAR(64)   -- SHA-256 해시
├── phone_number  VARCHAR(500)  -- AES-256으로 암호화
├── phone_hash    VARCHAR(64)   -- SHA-256 해시
```

이름으로 사용자를 검색해야 할 경우, 입력값을 동일한 해시 알고리즘(SHA-256 등)으로 변환한 뒤, `name_hash` 컬럼과 비교(`=`)하면 됩니다.

다만 이 방식은 암호화가 필요한 컬럼마다 해시 컬럼이 하나씩 추가되어 **테이블의 컬럼 수가 늘어난다는 단점**이 있습니다. 또한 해시 기반 검색이기 때문에 **완전 일치 검색만 가능**하며, `LIKE` 검색 같은 부분 검색은 불가능합니다.  

예쁜피오피에서는 사용자 이름 검색은 관리자 전용 기능으로만 제공하고 있습니다. 따라서 검색창에 '정확한 전체 이름을 입력해 주세요'라는 안내 메시지를 명시하여 완전 일치 검색의 기술적 한계를 UX로 보완했습니다.


#### **주소(Address): 일부 컬럼만 암호화**

주소는 일반적으로 우편번호, 기본 주소, 상세 주소로 구성됩니다.  
이번 예쁜피오피 프로젝트에서는 활용도를 고려하여 **기본 주소(`baseAddress`)는 암호화하지 않고 평문으로 유지**했습니다.  

```java
@Embeddable
public class Address {

    @Convert(converter = AesEncryptConverter.class)
    private String zipcode;

    private String baseAddress;        // 평문 유지

    @Convert(converter = AesEncryptConverter.class)
    private String detailAddress;
}
```

기본 주소는 시/도, 시/군/구 수준의 포괄적인 정보이기 때문에 그 자체로 개인을 특정할 수 없습니다.  
반면 대시보드나 지역별 통계 분석에서 자주 활용됩니다.  

따라서, 상세 주소(`detailAddress`)와 우편 번호(`zipcode`)만 암호화하여 보안을 챙기고, 기본 주소는 평문을 유지하여 통계 쿼리에서 사용할 수 있도록 했습니다.  


### **조회가 필요 없는 값: <span style="background-color: yellow;">단방향 해시</span>**

예쁜피오피에서는 소셜 로그인(OAuth)을 지원합니다.  
카카오, 네이버 같은 OAuth 제공자는 로그인한 사용자를 식별하기 위해 고유한 ID(`socialId`)를 발급합니다.  
보통 `socialId`는 DB에 저장해두고, 다음 로그인 시 동일한 사용자인지 식별하는 용도로 사용됩니다.  

`socialId`도 개인정보와 연결되는 식별자이기 때문에, 서비스 DB에 평문으로 저장하는 것은 적절하지 않다고 판단했습니다.  

다만 이름, 이메일 같은 개인정보와 다르게 화면에 표시하거나 DB에서 꺼내 쓸 일이 없기 때문에, 굳이 복호화가 가능한 양방향 암호화를 적용할 필요가 없습니다.  
따라서 원본을 알 수 없게 만드는 단방향 해시로 저장하기로 했습니다.  

OAuth 정보를 저장하는 `SocialInfo` 클래스에는 `socialId` 필드를 아예 없애고, SHA-256 등의 알고리즘을 거친 해시값(64바이트)만 저장하도록 socialIdHash 필드를 구성했습니다.

```java
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SocialInfo {

    @Enumerated(EnumType.STRING)
    private SocialType socialType;

    @Column(name = "social_id_hash", length = 64)
    private String socialIdHash;        // 평문 socialId 저장 안함, 해시값만 저장

    @Builder
    public SocialInfo(SocialType socialType, String socialIdHash) {
        this.socialType = socialType;
        this.socialIdHash = socialIdHash;
    }
}
```

단방향 해시로 저장하면 **DB가 털리거나 암호화 키가 유출되더라도 원본 값을 절대 복원할 수 없어 보안상 훨씬 안전**합니다.

> **핵심: 원본을 꺼내 써야 하면 양방향 암호화, 식별/검색만 하면 단방향 해시**

<br/>

## **3. API Rate Limiting**

---

Rate Limiting이 적용되지 않은 API는 무차별 대입 공격에 그대로 노출됩니다. 만약 로그인 API라면 비밀번호를 무한정 시도할 수 있고, 일반 API라면 과도한 요청으로 인해 서버 자원이 고갈될 위험이 있습니다.  

특히 SMS 인증이나 결제처럼 **외부 서비스와 연동된 API는 요청 한 번마다 비용이 발생**하기 때문에 더욱 철저한 제한이 필요합니다.  

### **토큰 버킷 알고리즘(Token Bucket Algorithm)**

Rate Limiting을 구현하는 다양한 알고리즘이 있지만, 예쁜피오피 프로젝트에서는 토큰 버킷 알고리즘을 적용했습니다.  

토큰 버킷은 이름처럼 **일정 용량의 버킷 안에 토큰을 담아두고, API 요청이 들어올 때마다 토큰을 소비하는 방식**입니다.  
버킷에 토큰이 남아 있으면 요청을 정상적으로 처리하고, 버킷이 비어있으면 `429 Too Many Requests`를 반환하여 요청을 차단합니다.  

예를 들어 "1분 동안 최대 5회 호출 가능"한 API가 있다면, 다음과 같이 해당 API의 버킷에는 초기 상태로 5개의 토큰이 주어집니다.  

<img src="/assets/img/post/backend/security/token-bucket-1.png" alt="토큰 버킷 1" style="max-width: 80%; height: auto;">

클라이언트가 API를 호출할 때마다 버킷을 확인하여, 토큰이 있다면 1개를 소비하고 요청을 처리합니다.  

<img src="/assets/img/post/backend/security/token-bucket-2.png" alt="토큰 버킷 2" style="max-width: 80%; height: auto;">

5번의 요청이 연속으로 발생해 버킷이 비워지게 되면, 이후 들어오는 요청은 처리되지 않고 즉시 429 에러를 응답하게 됩니다. (이후 정해진 주기에 따라 다시 토큰이 리필됩니다.)

<img src="/assets/img/post/backend/security/token-bucket-3.png" alt="토큰 버킷 3" style="max-width: 80%; height: auto;">

간단하지만 이를 직접 구현하려면 토큰 카운팅, 리필 타이밍 계산, 동시 요청에 대한 스레드 안전성까지 직접 처리해야 합니다.  
저는 이러한 복잡성을 줄이고 안정성을 높이기 위해, 이를 내부적으로 처리해 주는 Java 라이브러리인 `Bucket4j`를 활용했습니다.  

`Bucket4j`를 사용하면 **최대 용량(capacity)과 리필 주기(period)만 설정하여** 토큰 버킷의 핵심 동작을 손쉽게 적용할 수 있습니다.  

### **구현**

예쁜피오피에서는 Rate Limiting 로직을 Spring의 `HandlerInterceptor`를 통해 적용했습니다.  
컨트롤러에 진입하기 전, `preHandle()` 단계에서 토큰 알고리즘이 동작하도록 구성했습니다.  

```java
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        String uri = request.getRequestURI();

        // 1. URI에 매칭되는 정책 선택
        RatePolicy policy = getMatchedPolicy(uri);

        // 2. IP + 패턴으로 Bucket 키 생성
        String clientIp = resolveClientIp(request);
        String bucketKey = clientIp + ":" + getMatchedPattern(uri);
        Bucket bucket = buckets.computeIfAbsent(bucketKey, key -> createBucket(policy));

        // 3. 토큰 소비 시도
        if (bucket.tryConsume(1)) {
            return true;
        }

        sendRateLimitResponse(response); // 429 응답
        return false;
    }

    ...
}
```

여기서 주목할 점은 버킷을 식별하는 키를 `IP + API 경로 패턴`의 조합으로 생성했다는 것입니다.  

이를 통해 IP별, 엔드포인트별로 버킷을 독립적으로 관리할 수 있습니다. 결과적으로 특정 사용자가 제한 기준을 초과해 차단되더라도, 다른 정상적인 사용자나 해당 사용자의 다른 API 호출에는 전혀 영향을 주지 않습니다.  

> 현재 프로젝트에서는 간단하게 **ConcurrentHashMap**을 통해 버킷을 서버 메모리에서 관리하고 있습니다.  
> 서버가 다중화 환경이라면 Redis 기반의 버킷 저장소로 교체하여 분산 환경에서도 정확한 Rate Limiting이 동작하도록 확장을 고려해야 합니다.


### **엔드포인트별 차등 제한**

모든 API에 동일한 제한을 일괄 적용하면 서비스의 사용성이 크게 떨어질 수 있습니다.  
따라서 앞서 언급했던 SMS 인증이나 결제 등 비용이 발생하는 외부 API는 엄격하게, 일반 조회 API는 느슨하게 설정하는 등 API의 성격과 중요도에 따라 차등 정책을 적용했습니다.  

```java
// RateLimitInterceptor.java
private static final Map<String, RatePolicy> POLICIES = new LinkedHashMap<>();

static {
    // CRITICAL — 보안 민감 API
    POLICIES.put("/api/v1/auth/login",             new RatePolicy(5,   Duration.ofMinutes(1)));
    POLICIES.put("/api/v1/users/phone/verify/**",  new RatePolicy(3,   Duration.ofMinutes(5)));
    POLICIES.put("/api/v1/payments/*/pay",         new RatePolicy(3,   Duration.ofMinutes(1)));

    // HIGH — 데이터 변경 API
    POLICIES.put("/api/v1/admin/**",               new RatePolicy(30,  Duration.ofMinutes(1)));
    POLICIES.put("/api/v1/orders/**",              new RatePolicy(10,  Duration.ofMinutes(1)));

    // NORMAL — 검색/목록 조회
    POLICIES.put("/api/v1/products/search",        new RatePolicy(40,  Duration.ofMinutes(1)));
    POLICIES.put("/api/v1/gallery/**",             new RatePolicy(60,  Duration.ofMinutes(1)));

    // DEFAULT — 나머지 모든 API
    POLICIES.put("/api/v1/**",                     new RatePolicy(100, Duration.ofMinutes(1)));
}
```

| 등급 | 대상 | 제한 | 이유 |
|------|------|------|------|
| CRITICAL | 로그인, SMS 인증, 결제 | 1분에 3~5회 | 공격 차단 및 외부 비용 발생 |
| HIGH | 관리자 API, 주문 | 1분에 10~30회 | 계정 탈취 및 DB 부하 방지 |
| NORMAL | 상품 검색, 갤러리 | 1분에 40~60회 | DDoS 방어 |
| DEFAULT | 기타 모든 API | 1분에 100회 | |


<br/>

## **정리**

---

간단하게 토이 프로젝트를 진행하며, 이번에는 단순한 기능 구현을 넘어 실제 발생할 수 있는 보안 취약점을 점검하고 보완하는 시간을 가졌습니다.  
AI를 활용해 개발 속도를 높이는 것은 물론, 미처 생각하지 못했던 취약점을 방어하는 설계로까지 시야를 넓힐 수 있었습니다.  

제가 고민하고 적용한 ID 설계, 컬럼 암호화, 트래픽 제어 정책이 완벽한 정답은 아닐 것입니다.  
하지만 AI가 제안하는 여러 방법 중 서비스의 성격에 맞는 방식을 고민하고 선택하는 과정 자체가 제게는 큰 공부가 되었습니다.  

| 항목 | 핵심 원칙 |
|------|----------|
| ID 설계 | 엔티티 성격에 따라 외부에 노출되는 ID는 예측 불가능한 식별자로 |
| 컬럼 암호화 | 복호화 필요 여부에 따라 양방향/단방향 해시 선택 |
| Rate Limiting | 엔드포인트 민감도에 따라 차등 적용 |