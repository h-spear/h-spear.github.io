---
title: "Unique 제약 조건이 있는 DB에 데이터를 삽입하는 세 가지 전략 비교 분석"
date: 2025-10-17 20:00:00 +0900
categories: [Development, Database]
tags: [Database, SQL]
image: /assets/img/post/database/db-deduped-insert/db-three.png
thumbnail_description: Unique 제약 조건이 설정된 데이터베이스 테이블에 데이터를 삽입하는 다양한 방법을 비교하고 분석한 내용을 공유합니다.
---

데이터베이스에 값을 저장할 때, 중복된 값이 들어가지 않도록 하기 위해 개발자마다 다양한 처리 전략을 사용하고 있을 것입니다.

저는 주로 애플리케이션 레벨(보통 Spring)에서 `SELECT` 쿼리로 데이터 존재 여부를 확인한 후 `INSERT`를 수행하는 방식을 사용했습니다. 하지만 먼저 INSERT를 시도한 뒤 데이터베이스에서 **중복 예외(Duplicate Entry)**가 발생하면 `try-catch` 블록을 통해 처리하는 방식이나, 데이터베이스가 지원하는 `INSERT IGNORE`를 활용하는 방식도 있습니다.  

이번 글에서는 이 세 가지 방식의 장단점과 특징을 비교 · 분석하고, 그 내용을 공유하고자 합니다.

<br/>

## **목차**

- 세 가지 처리 방식
  - 공통: 환경 구성
  - 방법 1: SELECT 후 INSERT
  - 방법 2: INSERT 후 예외 처리
  - 방법 3: INSERT IGNORE
- 분석
  - 성능 테스트
  - 성능 외 고려사항
- 정리
- 소스 코드

<br/>

## **세 가지 처리 방식**

---

### **공통: 환경 구성**

각 방식을 설명하기 위한 엔티티는 단순하게 다음과 같이 설계했습니다.  
**기본 키**는 `id`이고, `email` 컬럼에는 **유니크 제약 조건**을 설정했습니다.  

```java
public class User {

    // 기본 키
	private UUID id;

    // Unique 제약 조건
	private String email;

	private String name;
}
```

참고로 테이블 생성 쿼리문은 다음과 같습니다.
```sql
CREATE TABLE user (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(45) NOT NULL
);
```

이제 `email` 중복을 피해 데이터를 삽입하는 세 가지 방법을 코드로 살펴보겠습니다.  
모든 예제는 아래의 공통된 요구사항을 기준으로 작성했습니다.

> 1. `user` 테이블에 데이터를 삽입한다.
> 2. `user` 테이블에 이미 중복된 이메일이 있으면, `UserEmailDuplicateException` 예외를 발생시킨다.

### **<span style="background-color: yellow;">방법 1: SELECT 후 INSERT</span>**

첫 번째는 **데이터를 삽입하기 전에 `SELECT` 쿼리를 통해 중복 값이 있는지 먼저 확인한 후 데이터를 `INSERT`**하는 방법입니다.  

간단하게 서비스 로직은 다음과 같습니다.  

```java
public UUID insertWithPreCheck(UserCreateDto dto) {
    Optional<User> optional = userRepository.findByEmail(dto.email());
    if (optional.isPresent()) {
        throw new UserEmailDuplicateException();
    }
    return userRepository.save(dto.toModel());
}
```

**동작 흐름**  
1. `findByEmail()`을 통해 DB에 `SELECT` 쿼리를 보내, 해당 이메일을 가진 데이터가 존재하는지 확인한다.
2. 만약 데이터가 존재한다면, 데이터를 삽입할 수 없으므로 `UserEmailDuplicateException` 예외를 발생시킨다.
3. 만약 데이터가 존재하지 않다면, `save()`를 통해 데이터를 삽입(`INSERT`)한다.

**특징**  
해당 방식은 비즈니스 로직이 명확하게 드러나 가독성이 뛰어난 방식입니다.  
하지만 데이터베이스에 두 번(`SELECT`, `INSERT`) 접근해야 하므로 비효율이 발생할 수 있고, 동시성 문제에 취약할 수 있습니다.  

### **<span style="background-color: yellow;">방법 2: INSERT 후 예외 처리</span>**

두 번째 방법은 **먼저 `INSERT`를 시도하고, 데이터베이스에서 중복 예외가 발생하면 `try-catch`로 처리하는 방식**입니다.  

```java
public UUID insertWithExceptionHandling(UserCreateDto dto) {
    try {
        return userRepository.save(dto.toModel());
    } catch (DataIntegrityViolationException e) {
        throw new UserEmailDuplicateException();
    }
}
```

**동작 흐름**  
1. `save()`를 통해 데이터를 삽입(`INSERT`)한다.
2. 데이터베이스에서 `DataIntegrityViolationException`이 발생하면, 해당 예외를 잡아 처리한다.
    - 처리 : `UserEmailDuplicateException` 예외를 발생시킨다.

**특징**  
데이터베이스의 제약 조건을 활용하는 방식으로, 조회 쿼리 없이 **`INSERT` 쿼리 한번만 사용합니다.**  
다만 로직에 `try-catch`문을 사용하기 때문에 코드를 복잡하게 만듭니다.  

### **<span style="background-color: yellow;">방법 3: INSERT IGNORE</span>**

마지막으로 `INSERT IGNORE`를 사용한 방식입니다.  
`INSERT IGNORE`는 데이터를 삽입할 때 중복 키와 같은 오류가 발생하면 작업을 중단하지 않고 해당 작업을 조용히 무시하는 명령어입니다.  

해당 기능은 데이터베이스 벤더마다 다양한 문법을 가지고 있습니다.  
MySQL에서는 중복 데이터를 다루는 방법으로 `INSERT IGNORE`, `ON DUPLICATE KEY UPDATE`(UPSERT) 등이 있지만, 이번에는 `INSERT IGNORE`를 활용해 보겠습니다.  
만약 중복 시 데이터 업데이트가 필요하다면 `ON DUPLICATE KEY UPDATE`를 활용할 수 있을 것입니다.

**INSERT IGNORE**
```sql
INSERT IGNORE INTO tbl_name (col_name [, col_name] ...)
{VALUES | VALUE} (value_list) [, (value_list)] ...;
```

- 출처 : [MySQL 8.0 Reference Manual :: 15.2.7 INSERT Statement](https://dev.mysql.com/doc/refman/8.0/en/insert.html){:target='_blank'}

**ON DUPLICATE KEY UPDATE(UPSERT)**
```sql
INSERT INTO t1 (a,b,c) VALUES (1,2,3)
  ON DUPLICATE KEY UPDATE c=c+1;

UPDATE t1 SET c=c+1 WHERE a=1;
```

- 출처 : [MySQL 8.0 Reference Manual :: 15.2.7.2 INSERT ... ON DUPLICATE KEY UPDATE Statement](https://dev.mysql.com/doc/refman/8.0/en/insert-on-duplicate.html){:target='_blank'}

<br/>

이 방식은 서비스 로직에서 **`saveIgnore()`**라는 새롭게 정의한 메서드를 호출했습니다.  

```java
public UUID insertIgnore(UserCreateDto dto) {
    UUID uuid = userRepository.saveIgnore(dto.toModel());
    if (uuid == null) {
        throw new UserEmailDuplicateException();
    }
    return uuid;
}
```

`saveIgnore()` 메서드는 내부에서 아래와 같은 `INSERT IGNORE` 쿼리를 실행합니다.
```sql
INSERT IGNORE user (id, email, name) VALUES (:id, :email, :name)
```


**동작 흐름**  
1. `saveIgnore()`를 통해 `INSERT IGNORE` 쿼리를 실행한다.
2. 삽입된 값이 없으면(이미 중복 데이터가 있으면), `UserEmailDuplicateException` 예외를 발생시킨다.

**특징**  
쿼리도 한 번만 수행하고, 애플리케이션 레벨에서 `try-catch`도 필요없습니다.  
하지만 JPA에서는 해당 문법을 지원하지 않고, 데이터베이스마다 문법이 다르다는 등의 단점이 있습니다.

<br/> 

## **분석**

---

### **성능 테스트**

#### **테스트 환경**
- **언어(Language)**: Java 21
- **프레임워크(Framework)**: Spring Boot 3.5.6
- **빌드 도구(Build Tool)**: Gradle
- **데이터베이스(Database)**: MySQL 8.0.32
- **데이터 접근 기술(Data Access)**: JDBC Template
- **테스트 도구(Test Tool)**: JUnit 5

#### **테스트 변수**
각 방식의 성능을 비교하기 위해, 다음 두 가지 핵심 변수를 변경하며 **실행 시간**을 측정했습니다.

1. **전체 데이터 수(Data Count)** : `INSERT`를 시도하는 데이터의 개수
2. **중복 데이터 비율(Duplicate Rate)** : `INSERT`를 시도하려는 데이터 중 이미 DB에 존재하는 데이터의 비율
  - `0%`: 모든 데이터가 신규 데이터인 케이스
  - `100%`: 모든 데이터가 이미 존재하는 케이스

#### **테스트 절차**
각 방식마다 다음 절차를 수행합니다.

1. 환경 초기화: 테이블 `TRUNCATE`
2. **중복 데이터 비율**만큼 데이터 사전 삽입
3. 시간 측정 시작
4. **전체 데이터 수**만큼 `INSERT`
5. 시간 측정 종료


#### <span style="background-color: yellow;">**테스트 결과**</span>
JUnit 5 테스트 코드로 처리 속도를 측정한 결과는 다음과 같습니다.  

**1. SELECT 후 INSERT**

| Data\Duplicate Rate | 0% | 25% | 50% | 75% | 100% |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **10** | 182ms | 27ms | 20ms | 20ms | 14ms |
| **50** | 150ms | 113ms | 89ms | 74ms | 40ms |
| **100** | 257ms | 143ms | 134ms | 80ms | 69ms |
| **500** | 795ms | 643ms | 490ms | 463ms | 261ms |
| **1,000** | 1,444ms | 980ms | 933ms | 647ms | 218ms |
| **5,000** | 5,936ms | 5,530ms | 3,670ms | 2,488ms | 915ms |
| **10,000** | 12,458ms | 11,122ms | 7,770ms | 5,340ms | 2,629ms |
| **50,000** | 68,176ms | 53,712ms | 41,121ms | 25,503ms | 10,723ms |
| **100,000** | 128,438ms | 110,874ms | 81,903ms | 58,806ms | 24,610ms |

**2. INSERT 후 예외 처리**

| Data\Duplicate Rate | 0% | 25% | 50% | 75% | 100% |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **10** | 2ms | 424ms | 12ms | 13ms | 0ms |
| **50** | 61ms | 73ms | 34ms | 19ms | 18ms |
| **100** | 116ms | 83ms | 82ms | 50ms | 72ms |
| **500** | 668ms | 504ms | 382ms | 628ms | 215ms |
| **1,000** | 888ms | 921ms | 834ms | 555ms | 615ms |
| **5,000** | 5,529ms | 4,180ms | 4,452ms | 2,617ms | 1,937ms |
| **10,000** | 9,234ms | 9,012ms | 8,802ms | 7,871ms | 4,579ms |
| **50,000** | 50,824ms | 44,906ms | 36,726ms | 30,524ms | 25,923ms |
| **100,000** | 102,257ms | 86,603ms | 78,169ms | 59,431ms | 39,183ms |

**3. INSERT IGNORE**

| Data\Duplicate Rate | 0% | 25% | 50% | 75% | 100% |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **10** | 9ms | 10ms | 5ms | 6ms | 0ms |
| **50** | 37ms | 26ms | 29ms | 15ms | 10ms |
| **100** | 88ms | 73ms | 49ms | 43ms | 34ms |
| **500** | 444ms | 388ms | 246ms | 196ms | 130ms |
| **1,000** | 995ms | 744ms | 535ms | 409ms | 253ms |
| **5,000** | 4,275ms | 3,692ms | 2,923ms | 2,176ms | 1,442ms |
| **10,000** | 8,784ms | 7,127ms | 5,558ms | 4,177ms | 2,928ms |
| **50,000** | 43,244ms | 35,211ms | 28,228ms | 21,237ms | 15,822ms |
| **100,000** | 86,180ms | 77,995ms | 71,093ms | 56,845ms | 33,832ms |

#### **테스트 결과 분석**

전체 데이터 수가 가장 많은 `100,000`건일 때를 기준으로, 각 데이터 삽입 방식별로 **데이터 중복 비율**에 따른 **실행 시간(ms)**을 그래프로 표현했습니다.  

<img src="/assets/img/post/database/db-deduped-insert/performance-chart.png" alt="성능 분석 그래프" style="max-width: 100%; height: auto;">


**<span style="background-color: lightskyblue;">1. SELECT 후 INSERT(파란색 선)</span>**

- **중복이 없을 때(0%):**
  - 가장 느린 성능을 보입니다.
  - 100,000건의 데이터를 삽입하기 위해 `SELECT` 10만 번, `INSERT` 10만 번  
  총 **20만 번의 쿼리**를 호출하기 때문에 성능이 가장 낮은 것으로 보입니다.  

- **중복 비율이 높아질수록(25%~75%):**
  - 데이터 중복 비율이 높아질수록 성능이 좋아집니다.
  - 중복 데이터가 많아질수록 `SELECT` 쿼리만 실행되고, `INSERT` 쿼리를 실행하지 않는 횟수가 늘어나기 때문입니다.

- **모든 데이터가 중복일 때(100%):**
  - 가장 빠른 성능을 보입니다.
  - `INSERT` 쿼리는 한 번도 실행되지 않고, `SELECT` 쿼리만 10만 번 실행하므로, 단순 조회 작업만 수행하기 때문입니다.

**<span style="background-color: orange;">2. INSERT 후 예외 처리(주황색 선)</span>**

- **중복이 없을 때(0%):**
  - **SELECT 후 INSERT** 방식보다 훨씬 빠르다.
  - `SELECT` 쿼리 호출 없이 `INSERT` 쿼리만 10만 번 실행되기 때문에 효율적인 것으로 보입니다.

- **중복 비율이 높아질수록(25%~75%):**
  - **SELECT 후 INSERT** 방식과 비교했을 때, 실행 시간이 완만하게 감소합니다.
  - 중복 데이터가 많아질수록 **예외가 발생하고 이를 처리(try-catch)하는 비용**이 추가되기 때문입니다.
    - 하지만 예외를 처리하는 비용이 `SELECT` 쿼리를 한 번 더 실행하는 것보다는 저렴하는 것을 알 수 있습니다.

- **모든 데이터가 중복일 때(100%):**
  - 가장 느린 성능을 보입니다.

**<span style="background-color: greenyellow;">3. INSERT IGNORE(초록색 선)</span>**

- **중복이 없을 때(0%):**
  - 가장 빠른 성능을 보입니다.

- **중복 비율이 높아질수록(25%~75%):**
  - 가장 빠른 성능을 보입니다.
  - 쿼리 호출 횟수는 **INSERT 후 예외 처리** 방식과 같지만, 더 빠른 성능을 보입니다.

- **모든 데이터가 중복일 때(100%):**
  - **INSERT 후 예외 처리** 방식보다는 빠르고, **SELECT 후 INSERT** 방식보다는 느립니다.

### **성능 외 고려사항**

#### **동시성(Race Condition)**
**SELECT 후 INSERT 방식은 동시성 문제에 취약합니다.** `SELECT`로 중복이 없음을 확인한 후 `INSERT`를 실행하기 전에 다른 스레드에서 먼저 데이터를 삽입하여, 데이터 정합성이 깨질 수 있습니다.  
동시성이 높은 서비스에서 별도의 락(Lock) 장치 없이 **SELECT 후 INSERT** 방식만 사용하는 것은 위험할 수 있습니다.  

반면 **나머지 두 방식은 동시성 문제가 발생하지 않습니다.** 하나의 `INSERT` 쿼리만 실행하기 때문에, 데이터베이스에서 모든 과정을 원자적(Atomic)으로 처리하기 때문입니다.  

#### **DB 종속성**
다른 방식과 달리, **INSERT IGNORE** 방식은 **데이터베이스 종속성**이라는 명확한 단점을 가집니다.  
즉, 기능을 구현하기 위한 쿼리문이 데이터베이스에 종속되기 때문입니다.

특히 데이터 접근 방식으로 **JPA**를 사용하는 환경에서 이 문제는 더욱 부각됩니다.  
1. **JPA 표준 기능이 아님:** JPA는 `INSERT IGNORE`, `UPSERT` 기능을 별도로 제공하지 않음
2. **Native Query 사용:** `@Query(nativeQuery = true)`를 통해 직접 SQL 쿼리를 작성해야 함
3. **유지보수 비용 증가:** JPA가 제공하는 **데이터베이스 추상화** 기능을 이용할 수 없음

<br/>

## **정리**

---

지금까지 분석한 내용을 표로 정리하면 다음과 같습니다.  

|기준|SELECT 후 INSERT|INSERT 후 예외 처리|INSERT IGNORE|
|------|---|---|---|
|성능(대부분 신규 데이터일 때)|가장 느림|빠름|가장 빠름|
|성능(대부분 중복 데이터일 때)|가장 빠름|가장 느림|느림|
|동시성 문제|발생 가능성 있음|발생하지 않음|발생하지 않음|
|DB 종속성|없음|없음|높음|

이번 글에서 진행한 성능 분석은 단순하게 **데이터베이스 삽입 속도**만을 비교한 결과입니다.  
성능 분석 결과만 보고 **INSERT IGNORE** 방식이 가장 좋다고 말할 수도 없고, 마찬가지로 **SELECT 후 INSERT** 방식이 무조건 나쁘다고 단정할 수도 없습니다.  

결국 중요한 것은 **동시성, 데이터 정합성, 가독성, 유지보수 비용** 등 다양한 지표를 고려하여 자신의 서비스에 적합한 전략을 선택하는 것입니다.


<br/>

## **소스 코드**
> 성능 측정에 사용된 전체 코드는 아래 GitHub 리포지토리에서 확인하실 수 있습니다.  
-   <img src="https://github.githubassets.com/assets/pinned-octocat-093da3e6fa40.svg" width="20" height="20"/> [[Github Repository] h-spear/insert-data-into-database-without-duplication
](https://github.com/h-spear/insert-data-into-database-without-duplication){:target='_blank'}