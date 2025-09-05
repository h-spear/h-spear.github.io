---
title: "Algo Plus: AWS Lambda 함수 개선을 통한 개발 편의성 향상"
date: 2025-09-04 19:00:00 +0900
categories: [Project, Algo Plus]
tags: [Algo Plus, AWS Lambda]
image: /assets/img/post/algo-plus/logo-icon.png
thumbnail_description: 기존 'Algo Plus'에서 사용하던 AWS Lambda 함수의 코드를 개선하여, 개발 편의성을 향상시켰던 사례에 대해 소개합니다.
---

저희 서비스 **`Algo Plus`**는 AWS Lambda를 사용하고 있습니다.  
보안을 강화하기 위해 AWS Lambda에서 요청의 Origin을 검사하여, 크롬 웹 스토어에 등록된 공식 **`Algo Plus`**가 아닌 경우 요청을 거절하고 실패 응답을 반환하도록 설계했습니다.  
다만 이러한 구조 때문에 개발 과정에서는 불편한 점이 있었습니다. 이번 글에서는 그 불편함이 무엇이었는지 그리고 어떻게 개선했는지를 공유하고자 합니다.  

> **`Algo Plus`**의 설계에 대한 이야기는 다음 포스팅에서 확인하실 수 있습니다.
- <a href="/h-spear/posts/algoplus-introduce/">Algo Plus: 알고 플러스 개발 및 배포 경험기</a>

<br/>

> 프로그램 설치, 리포지토리 정보 및 데모 영상은 아래 링크를 참고해 주세요.
-   <img src="https://github.githubassets.com/assets/pinned-octocat-093da3e6fa40.svg" width="20" height="20"/> [Github Repository](https://github.com/algo-plus){:target='_blank'}
-   <img src="https://www.google.com/images/icons/product/chrome_web_store-256.png" width="20" height="20"/> [Chrome 웹 스토어](https://chromewebstore.google.com/detail/algo-plus/egomkekembecbmlmmoflfdaobgkliiid){:target='_blank'}
-   <img src="https://www.youtube.com/s/desktop/3637873e/img/logos/favicon_96x96.png" width="20" height="20"/> [Demo](https://youtu.be/8h0NrgmRRuY?feature=shared){:target='_blank'}

<br/>

## **목차**
- 배경
- 배경 및 문제점
    - 기존 구조
    - 기존 구조의 문제점
- 문제 해결 및 개발 편의성 증가
    - 해결 과정
    - 개발 편의성 증가
- 결론
  
<br/>

## **배경 및 문제점**
---
### **기존 구조**
**`Algo Plus`**는 AWS Lambda에서 요청의 Origin을 검사하여, **`Algo Plus`** 사용자만 JDoodle API를 호출할 수 있도록 제한함으로써, 악의적인 사용자의 불필요한 호출을 방어했습니다.  
특히 JDoodle API는 일일 2,025회 호출이 제한된 유료 요금제(월 약 30,000원/2025.09월 기준)를 사용 중이기에, 이러한 불필요한 API 호출을 차단하는 것이 매우 중요했습니다.  

**`Algo Plus`**의 AWS Lambda 함수의 코드 일부는 다음과 같습니다.  
```python
import json
import requests
from requests.exceptions import Timeout

# 크롬 웹 스토어에 등록된 Algo Plus Item ID
EXTENSION_ITEM_ID = 'egomkekembecbmlmmoflfdaobgkliiid'         


def validate_request(event):
    expected_origin = f'chrome-extension://{EXTENSION_ITEM_ID}'
    origin = event.get('headers', {}).get('origin', '')
    is_from_algoplus_extension = origin == expected_origin

    return is_from_algoplus_extension


def lambda_handler(event, context):
    # 요청의 Origin 검사
    if not validate_request(event):
        return {'statusCode': 403, 'body': json.dumps({"output": 'Unauthorized request'})}


    # JDoodle API 호출 및 반환 로직(상세 코드 생략)
    CALL_JDOODLE_API()
    return OUTPUT
```
AWS Lambda 함수 내에서 공식 **`Algo Plus`**에서 발생한 호출, 즉 **Origin 헤더가 `Algo Plus` 크롬 웹 스토어 Item ID(`egomkekembecbmlmmoflfdaobgkliiid`)와 일치하는 경우**에만 요청을 처리합니다.  
`validate_request()` 함수에서 Origin을 검사하여, 일치하지 않을 경우 403 상태 코드와 함께 요청을 거부하도록 구현되어 있습니다.  

**참고**
> **크롬 웹 스토어에 등록된 확장 프로그램이 API를 호출할 때, 요청의 Origin 헤더에는 확장 프로그램 고유의 Item ID가 `chrome-extension://<EXTENSION_ID>` 형식으로 포함됩니다.**  
서버에서 이 Origin 헤더를 통해 요청이 해당 확장 프로그램에서 발생했는지 확인할 수 있습니다.

<br/>

![aws-lambda-origin-check](/assets/img/post/algo-plus/aws-lambda-origin-check.png)   

### **기존 구조의 문제점**

문제는 <span style="background-color:#fee6ff">**`Algo Plus`개발자들이 사용하는 개발용 버전 또한 크롬 웹 스토어에 등록된 공식 `Algo Plus`가 아니기 때문에, 개발 환경에서의 API 호출도 차단된다는 점입니다.**</span>  
이로 인해 실제 운영 환경에서 사용되는 AWS Lambda 함수를 테스트하는 데 어려움이 있었습니다.  

개발 및 테스트 과정에서 팀원들은 `validate_request()` 함수가 항상 `True`를 반환하도록 임시로 수정하여 작업했습니다.  
```python
def validate_request(event):
    expected_origin = f'chrome-extension://{EXTENSION_ITEM_ID}'
    origin = event.get('headers', {}).get('origin', '')
    is_from_algoplus_extension = origin == expected_origin

    # return is_from_algoplus_extension
    return True   # 해당 코드는 테스트를 위한 코드입니다.
```

<br/>
해당 방식의 문제점은 다음과 같습니다.  

##### **1. 테스트 과정의 번거로움**  
개발 및 테스트를 진행할 때마다 Lambda 함수를 수정하고 다시 Deploy 해야하는 번거로움이 있습니다. 또한, 개발자가 변경한 코드를 원래 상태로 복구하는 것을 잊고 방치할 위험도 존재합니다.  
##### **2. 개발/테스트 기간 동안 악의적인 요청을 방어하지 못함**  
검증 로직이 항상 `True`를 반환하기 때문에 실제 운영 중인 **`Algo Plus`**외에도 악성 요청이나 불필요한 호출이 차단되지 않습니다. 이로 인해 JDoodle API 리소스가 낭비되거나 보안상 허점이 발생할 수 있습니다.  

<br/>

## **문제 해결 및 개발 편의성 증가**
---
### **해결 과정**
문제는 간단하게 해결할 수 있었습니다.  
`validate_request()` 함수가 단순히 Origin 헤더만으로 통과 여부를 판단하지 않고, **`Algo Plus`** 개발자들만 공유하는 **비밀 키**를 함께 검사하도록 수정한 것입니다.  
즉, 기존의 `is_from_algoplus_extension` 조건 외에도 비밀 키 조건을 `or`로 결합하여 통과 여부를 결정했습니다.  

개선된 코드는 다음과 같습니다.
```python
def validate_request(event):
    expected_origin = f'chrome-extension://{EXTENSION_ITEM_ID}'
    origin = event.get('headers', {}).get('origin', '')
    is_from_algoplus_extension = origin == expected_origin

    body = json.loads(event.get('body', '{}'))
    key = body.get('key', '')
    has_algoplus_secret_key = key == ALGOPLUS_SECRET_KEY

    return is_from_algoplus_extension or has_algoplus_secret_key
```
이제 Origin만 확인하는 것이 아니라, 요청의 body에서 'key'라는 필드 값을 확인하여, 이 값이 사전에 정해진 비밀 키(`ALGOPLUS_SECRET_KEY`)와 일치하는 경우에도 요청을 처리합니다.  

<br/>

##### **Postman 호출**  
Postman을 사용해 테스트한 결과, 요청의 JSON body에 비밀 키가 포함된 경우는 AWS Lambda 함수가 정상 처리되어 JDoodle API의 결과를 잘 받아오는 것을 확인했습니다. (이미지의 key 값은 현재는 사용되지 않습니다.)
<div style="display: flex; gap: 10px; justify-content: center; align-items: flex-start;">
  <figure style="margin: 0;">
    <figcaption align="center"><b>body에 key가 없음</b></figcaption>
    <img src="/assets/img/post/algo-plus/aws-lambda-without-key.png" alt="Image 1" style="max-width: 100%; height: auto;">
  </figure>
  <figure style="margin: 0;">
    <figcaption align="center"><b>body에 key가 있음</b></figcaption>
    <img src="/assets/img/post/algo-plus/aws-lambda-with-key.png" alt="Image 2" style="max-width: 100%; height: auto;">
  </figure>
</div>

### **개발 편의성 증가**
해당 방식을 사용함으로써 기존 문제점을 해결할 수 있었습니다.  

##### **1. 테스트 과정의 번거로움**  
<span style="color: #0086bd; font-weight: 600">→ 개발 및 테스트 과정에서 Lambda 함수를 수정하고 다시 배포하는 번거로움이 사라짐</span>

##### **2. 개발/테스트 기간 동안 악의적인 요청을 방어하지 못함**  
<span style="color: #0086bd; font-weight: 600">→ Origin 헤더를 체크하는 로직이 항상 존재함</span>

<br/>

## **결론**
---
이제 **`Algo Plus`** 개발자들은 Lambda 함수를 직접 수정하지 않고도 개발과 테스트를 진행할 수 있게 되었습니다.  
비밀 키는 관리자들만 공유하는 값으로, 외부에 노출되지 않도록 주의해야 합니다.  
또한, 해당 API를 활용해서 테스트 자동화 기능도 구현할 수 있어, 개발 편의성뿐만 아니라 운영 관리의 편의성도 크게 개선되었습니다.  

다음 포스팅에서는 **`Algo Plus`** 운영 관리를 위한 모니터링 대시보드 개발에 대해 다뤄보겠습니다.

---

**관련 게시글**

- [Algo Plus: 알고 플러스 개발 및 배포 경험기](/h-spear/posts/algoplus-introduce/)