---
title: "[Java] HashMap에서 String 키가 Long 키보다 메모리를 더 쓰는 이유"
date: 2026-08-19 20:00:00 +0900
categories: [Language, Java]
tags: [Java, HashMap, String, Long, Memory]
image: /assets/img/post/java-hashmap/hash-and-key.png
thumbnail_description: HashMap 내부 구조와 String·Long 키의 객체 구조를 살펴보고, JOL 측정을 통해 키 타입에 따른 메모리 사용량의 차이를 분석합니다.
use_math: true
---

최근 **[디지털 로직 패턴 검사](https://www.codetree.ai/ko/frequent-problems/hsat/problems/check-digital-logic-pattern){:target='_blank'}**라는 알고리즘 문제를 풀면서 `HashMap<String, Integer>`를 사용했습니다.  
제출 결과 176MB의 메모리가 측정되었지만, 키 타입을 `String`에서 `Long`으로 변경해 `HashMap<Long, Integer>`를 사용하자 메모리 사용량이 16MB로 감소했습니다.   
두 코드가 저장하는 정보와 엔트리의 개수는 같았지만, 키를 표현하는 방식만으로 큰 메모리 차이가 발생했습니다.  

`HashMap`은 키의 내용을 복사해 저장하지 않고, 각 엔트리에 키 객체의 참조를 보관합니다.  
따라서 실제 메모리 사용량을 이해하려면 `HashMap`의 내부 구조뿐 아니라 키 객체와 그 객체가 참조하는 데이터의 구조도 함께 살펴봐야 합니다.  

이 글에서는 **Java 21의 OpenJDK 구현을 기준으로** `HashMap`의 내부 구조와 키를 저장하는 방식을 먼저 살펴봅니다.  
이후 `String`과 `Long` 객체의 구조를 비교하고, JOL을 이용해 두 키 타입에서 실제 메모리 사용량이 어떻게 달라지는지 확인해 보겠습니다.   

> 이 글의 배경이 된 문제와 해결 과정은 다음 게시글에서 확인할 수 있습니다.   
> - **관련 게시글** : [[HSAT 11차 1번] 디지털 로직 패턴 검사 — HashMap 메모리 초과 해결](/posts/hsat-11-1){:target='_blank'}   

<br/>

## **목차**

- HashMap의 구조
  - HashMap이 키를 저장하는 방식
- String 키와 Long 키의 객체 구조
- JOL을 이용한 메모리 사용량 비교
  - 실험 조건
  - 측정 코드
  - 측정 결과
  - 측정 결과 분석
    - 두 맵에 공통으로 포함되는 메모리
    - 키 객체에서 발생한 차이
- 마치며

<br/>

## **HashMap의 구조**

`HashMap`은 키와 값을 저장하기 위해 내부적으로 `Node` 배열을 사용합니다.
```java
transient Node<K, V>[] table;
```

`table` 배열의 각 칸은 **버킷(bucket)**이라고 하며, 키의 해시값을 이용해 엔트리를 저장할 버킷을 결정합니다.   
각 키-값 쌍은 다음과 같은 `Node` 객체에 저장됩니다.   

```java
static class Node<K, V> implements Map.Entry<K, V> {
    final int hash;   // 키로부터 계산한 해시값
    final K key;      // 키 객체의 참조 
    V value;          // 값 객체의 참조
    Node<K, V> next;  // 같은 버킷에 저장된 다음 Node의 참조
}
```

<img src="/assets/img/post/java-hashmap/hashmap-structure.png"
     alt="HashMap의 table 배열과 Node 연결 구조"
     style="display: block; max-width: 80%; height: auto; margin: 0 auto;">

그림과 같이 `table` 배열의 각 버킷은 해당 위치에 저장된 첫 번째 `Node`를 참조하며, 비어 있는 버킷에는 `null`이 저장됩니다.   
같은 버킷에 여러 엔트리가 저장되면 각 `Node`의 `next` 필드를 통해 다음 `Node`와 연결됩니다.   

### **HashMap이 키를 저장하는 방식**

`Node`의 `key` 필드에는 키의 내용이 직접 저장되는 것이 아니라 키 객체를 가리키는 참조가 저장됩니다.   

`HashMap`에 키와 값을 추가하면 키로부터 해시값을 계산합니다.   
하지만 서로 다른 키가 같은 해시값을 가질 수 있으므로, 해시값만으로는 키를 완전히 구분할 수 없습니다.   
따라서 `HashMap`은 실제 키 객체도 함께 보관합니다.   

키를 조회할 때는 먼저 저장된 해시값을 비교합니다.   
해시값이 같다면 `==`로 동일한 객체인지 확인하고, 다른 객체라면 `equals()`를 이용해 논리적으로 같은 키인지 확인합니다.   
```java
node.hash == hash && (node.key == key || (key != null && key.equals(node.key)))
```

이처럼 `Node`의 `key` 필드가 실제 키 객체를 계속 참조하므로, 사용 중인 `HashMap`에 엔트리가 존재하는 동안 키 객체는 GC의 대상이 되지 않습니다.   

<br/>

## **String 키와 Long 키의 객체 구조**

### **String**

Java 21의 OpenJDK에서 `java.lang.String` 클래스를 확인해보면, 문자열의 실제 데이터가 내부 `byte[]`에 저장되는 것을 확인할 수 있습니다.   

```java
public final class String {

    private final byte[] value;  // 문자열의 실제 데이터
    private final byte coder;    // LATIN1 또는 UTF16 구분
    // ...
}
```

`value`는 문자열 데이터를 담은 `byte[]` 객체를 참조합니다.   
따라서 `String`을 `HashMap`의 키로 사용하면 `Node`가 `String` 객체를 참조하고, `String` 객체는 다시 `byte[]` 객체를 참조합니다.   

<img src="/assets/img/post/java-hashmap/hashmap-key-string.png"
     alt="HashMap의 String Key 참조 관계"
     style="display: block; width: auto; height: 48px; margin: 0 auto;">

### **Long**

Java의 제네릭 타입 인자에는 `long`과 같은 기본형을 사용할 수 없습니다.   
따라서 `HashMap<Long, ...>`에 `long` 값을 키로 전달하면 **오토박싱(autoboxing)**을 통해 `Long` 객체로 변환됩니다.   

Java 21의 OpenJDK에서 `java.lang.Long` 클래스를 확인하면, 다음과 같이 기본형 `long` 값을 `value` 필드에 저장합니다.   

```java
public final class Long {

    private final long value;
    // ...
}
```

따라서 `Long`을 `HashMap`의 키로 사용하면 다음과 같은 참조 관계가 만들어집니다.   


<img src="/assets/img/post/java-hashmap/hashmap-key-long.png"
     alt="HashMap의 Long Key 참조 관계"
     style="display: block; width: auto; height: 48px; margin: 0 auto 20px;">


두 방식 모두 `HashMap`, `table`, `Node`를 공통으로 사용하므로 키 타입에 따라 달라지는 부분은 `Node.key`가 참조하는 객체입니다.   
**`String` 키는 `String` 객체와 별도의 `byte[]` 객체를 메모리에 유지하지만, `Long` 키는 객체 내부에 기본형 `long` 값을 직접 저장합니다.**   
따라서 동일한 개수의 엔트리를 저장하면 `String` 키를 사용한 `HashMap`이 더 많은 메모리를 사용할 것으로 예상할 수 있습니다.   

<br/>

## **JOL을 이용한 메모리 사용량 비교**

JOL 라이브러리의 `GraphLayout`은 지정한 객체에서 참조를 따라 도달할 수 있는 모든 객체의 개수와 전체 메모리 크기를 측정하는 클래스입니다.   

```gradle
dependencies {
    implementation 'org.openjdk.jol:jol-core:0.17'
}
```

### **실험 조건**
- Java 21 OpenJDK
- 서로 다른 키 **1,000,000개** 저장
- `String` 키는 길이가 60인 이진 문자열
- `Long` 키는 해당 이진 문자열과 같은 값을 나타내는 숫자
- 두 맵의 값은 동일한 `Integer` 객체 사용
- 객체 크기는 이번 JVM 실행 환경에서 측정된 값으로 다른 환경에서는 크기가 달라질 수 있음

### **측정 코드**

서로 다른 `longKey`를 길이 60의 이진 문자열로 변환하여 `stringKey`를 만들었습니다.   
이후 두 맵에 동일한 수를 나타내는 키를 사용하고 값도 동일하게 저장하여, 키 타입을 제외한 조건을 같게 맞췄습니다.   
```java
Map<String, Integer> stringMap = new HashMap<>();
Map<Long, Integer> longMap = new HashMap<>();

for (long longKey: keys) {
    String stringKey = String
            .format("%60s", Long.toBinaryString(longKey))
            .replace(' ', '0');

    stringMap.put(stringKey, 1);
    longMap.put(longKey, 1);
}
```

각 맵에서 참조할 수 있는 전체 객체의 크기는 `GraphLayout`을 이용해 측정했습니다.   
```java
System.out.println( GraphLayout.parseInstance(stringMap).toFootprint() );
System.out.println( GraphLayout.parseInstance(longMap).toFootprint() );
```

<details>
<summary><strong>전체 측정 코드 보기</strong></summary>

<div markdown="1">

```java

import org.openjdk.jol.info.GraphLayout;

import java.util.HashMap;
import java.util.Map;

public class HashMapKeyMemoryMeasurement {

    public static void main(String[] args) {


        int keyCount = 1_000_000;

        Map<String, Integer> stringMap = new HashMap<>();
        Map<Long, Integer> longMap = new HashMap<>();

        for (int i = 0; i < keyCount; ++i) {
            long key = (1L << 50) + i;
            String stringKey = String.format("%60s", Long.toBinaryString(key))
                    .replace(' ', '0');

            stringMap.put(stringKey, 1);
            longMap.put(key, 1);
        }

        System.out.println(
                GraphLayout.parseInstance(stringMap).toFootprint()
        );
        System.out.println(
                GraphLayout.parseInstance(longMap).toFootprint()
        );
    }
}

```

</div>
</details>

### **측정 결과**

`String` 키를 사용한 `HashMap`의 측정 결과는 다음과 같습니다.

```text
java.util.HashMap@3b81a1bcd footprint:
     COUNT       AVG       SUM   DESCRIPTION
   1000000        80  80000000   [B 
         1   8388624   8388624   [Ljava.util.HashMap$Node;
         1        16        16   java.lang.Integer
   1000000        24  24000000   java.lang.String
         1        48        48   java.util.HashMap
    997650        32  31924800   java.util.HashMap$Node
      2350        56    131600   java.util.HashMap$TreeNode
   3000003           144445088   (total)
```

`Long` 키를 사용한 `HashMap`의 측정 결과는 다음과 같습니다.   

```text
java.util.HashMap@6d81d748d footprint:
     COUNT       AVG       SUM   DESCRIPTION
         1   8388624   8388624   [Ljava.util.HashMap$Node;
         1        16        16   java.lang.Integer
   1000000        24  24000000   java.lang.Long
         1        48        48   java.util.HashMap
   1000000        32  32000000   java.util.HashMap$Node
   2000003            64388688   (total)
```

JOL은 배열 타입을 JVM 내부 형식으로 표시합니다.   
`[B`는 `byte[]`를 의미하며, `[Ljava.util.HashMap$Node;`는 `HashMap.Node[]`를 의미합니다.

두 맵의 도달 가능한 객체 그래프의 크기를 비교하면 다음과 같습니다.

| 키 타입 | 도달 가능한 객체 그래프의 크기 |
|---|---:|
| `String` | 144,445,088B |
| `Long` | 64,388,688B |
| 차이 | 80,056,400B |

### **측정 결과 분석**

#### **두 맵에 공통으로 포함되는 메모리**

두 맵은 `HashMap`, `table`, `Node`, `Integer` 객체를 공통으로 필요로 합니다.   
측정 결과에서도 이러한 객체들은 두 맵에서 동일하거나 유사한 크기를 차지합니다.

| 객체 | `String` 키 | `Long` 키 |
|---|---:|---:|
| `HashMap` | 48B | 48B |
| `HashMap.Node[]` | 8,388,624B | 8,388,624B |
| `Integer` | 16B | 16B |
| `Node` 계열 | 32,056,400B | 32,000,000B |

`String` 키를 사용한 맵에서는 일부 엔트리가 `TreeNode`로 변환되어 `Node` 계열의 객체 그래프 크기에 56,400바이트의 차이가 발생했습니다.   
다만 이는 전체 메모리 차이의 약 0.07%에 불과하므로, 두 키 타입의 메모리 차이에 미치는 영향은 매우 작습니다.   


#### **키 객체에서 발생한 차이**

측정 결과에서 `String` 객체와 `Long` 객체는 모두 하나당 **24바이트**였습니다.   

| 객체 | 키 하나의 크기 | 1,000,000개의 크기 |
|---|---:|---:|
| `String` 객체 | 24B | 24,000,000B |
| `String`의 `byte[]` | 80B | 80,000,000B |
| `Long` 객체 | 24B | 24,000,000B |

<span style="background-color:yellow">**`String` 객체 자체가 `Long` 객체보다 큰 것은 아니며, 가장 큰 차이는 `String`이 추가로 참조하는 `byte[]`에서 발생했습니다.**</span>

이번 실행 환경에서 길이 60의 이진 문자열을 저장하는 `byte[]`는 객체 헤더와 정렬을 포함해 하나당 **80바이트**로 측정되었습니다.   

<div style="text-align: center;" markdown="1">

$1{,}000{,}000 \times 80\ \mathrm{bytes} = 80{,}000{,}000\ \mathrm{bytes}$

</div>

따라서 `String` 키를 사용한 맵은 문자열 데이터를 저장하는 `byte[]`로 인해 **80MB(약 76.3MiB)**의 메모리를 추가로 사용했습니다.   
`byte[]`에서 발생한 80,000,000바이트와 `TreeNode`에서 발생한 56,400바이트를 합하면 두 맵의 전체 메모리 차이인 80,056,400바이트와 정확히 일치합니다.

> JOL의 `GraphLayout`은 지정한 객체에서 도달할 수 있는 객체만 측정합니다.   
> 따라서 문자열 변환 과정에서 생성된 임시 객체, JVM 자체 메모리와 GC 비용은 이번 측정 결과에 포함되지 않습니다.

<br/>

## **마치며**

이번 비교에서 메모리 차이를 만든 핵심은 `HashMap` 자체가 아니라 **키를 표현하는 객체 구조였습니다.**

측정 환경에서 `String`과 `Long` 객체는 모두 하나당 24바이트였습니다.   
그러나 `String`은 문자열 데이터를 담는 별도의 `byte[]`를 추가로 유지해야 했고, 이 배열이 두 키 타입의 메모리 차이 대부분을 차지했습니다.   

물론 모든 문자열 키를 숫자로 바꾸는 것이 좋은 것은 아닙니다.   
**[디지털 로직 패턴 검사](https://www.codetree.ai/ko/frequent-problems/hsat/problems/check-digital-logic-pattern){:target='_blank'}** 문제는 모든 패턴의 길이가 동일한 `K`이고, 각 패턴이 `0`과 `1`로만 구성되며 `K`가 최대 60이었기 때문에 각 패턴을 하나의 `long` 값으로 손실 없이 표현할 수 있었습니다.   
이 문제에서는 이러한 조건 덕분에 문자열 대신 `Long` 키를 사용하여 메모리를 더 효율적으로 사용할 수 있었습니다.   

자료구조의 키 타입은 **데이터의 의미, 표현 가능한 값의 범위, 메모리 사용량**을 함께 고려해 선택해야 합니다.   
