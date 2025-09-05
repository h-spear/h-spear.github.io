---
title: "Algo Plus: 알고 플러스 개발 및 배포 경험기"
date: 2025-06-29 19:00:00 +0900
categories: [Project, Algo Plus]
tags: [Algorithm, Algo Plus, BOJ, AWS Lambda]
image: /assets/img/post/algo-plus/logo-icon.png
thumbnail_description: 실전 코딩 테스트 환경을 제공하는 크롬 확장 프로그램 'Algo Plus'를 개발하며, 설계와 배포 과정에서 마주했던 고민들을 정리해 공유합니다.
---

**`Algo Plus`**는 코딩 테스트를 준비하는 IT 취업 준비생을 위해 실제 코딩 테스트 환경을 제공하는 프로그램입니다.  
개발적인 내용보다는, 기획과 설계, 실제 배포까지 진행하면서 겪은 고민들을 정리해 공유하고자 합니다.  
참고로 **`Algo Plus`**는 크롬 확장 프로그램(Chrome Extension)으로, 현재 크롬 웹 스토어에서 누구나 다운로드하여 사용할 수 있습니다.  
사용자는 대략 200명 정도입니다. (2025.06.29 기준)  

> 프로그램 설치, 리포지토리 정보 및 데모 영상은 아래 링크를 참고해 주세요.
-   <img src="https://github.githubassets.com/assets/pinned-octocat-093da3e6fa40.svg" width="20" height="20"/> [Github Repository](https://github.com/algo-plus){:target='_blank'}
-   <img src="https://www.google.com/images/icons/product/chrome_web_store-256.png" width="20" height="20"/> [Chrome 웹 스토어](https://chromewebstore.google.com/detail/algo-plus/egomkekembecbmlmmoflfdaobgkliiid){:target='_blank'}
-   <img src="https://www.youtube.com/s/desktop/3637873e/img/logos/favicon_96x96.png" width="20" height="20"/> [Demo](https://youtu.be/8h0NrgmRRuY?feature=shared){:target='_blank'}

<br/>

## **목차**
- 프로젝트 기획 배경
  - 주제 선정
  - 오답 노트 기능
- 프로젝트 구조
  - 기능 소개
  - 아키텍처
  - 기술 스택
- 프로젝트 진행 과정에서의 기술 선택과 고민
  - 크롬 확장 프로그램으로 개발한 이유?
  - 백엔드 서버를 구축하지 않고, JDoodle API를 사용한 이유?
  - AWS Lambda를 사용한 이유?
  
<br/>

## **프로젝트 기획 배경**
---
### **주제 선정**

제가 주로 이용하던 플랫폼은 **Baekjoon Online Judge(이하 백준)**와 **프로그래머스**였는데, 취업을 목표로 알고리즘을 공부하는 입장에서 두 플랫폼의 장단점이 명확하게 느껴졌습니다.

|  |백준|프로그래머스|
|------|---|---|
|**문제 수**|많음|상대적으로 적음|
|**입출력 처리**|직접 구현해야 함|함수형 문제 제공|
|**코드 공유**|다른 사람 풀이 공개|다른 사람 풀이 공개|
|**IDE**|없음(로컬에서 작성 후 제출)|웹 IDE 제공|

백준의 장점은 **많은 문제 수**입니다. 다양한 난이도와 유형의 문제를 접할 수 있어 알고리즘 실력을 쌓기에 좋습니다. 반면 프로그래머스는 많은 기업에서 실제 코딩 테스트 플랫폼으로 활용하고 있기 때문에 **실전 감각**을 익히기 좋습니다.  

실제 코딩 테스트는 주로 **웹 IDE** 환경에서 진행됩니다. 제가 경험한 코딩 테스트 역시 대부분 웹 IDE 환경이었습니다. 웹 IDE는 IntelliJ같은 개발 툴에 비해 힌트나 자동 완성 기능이 부족해 코딩 난이도가 더 높다고 느껴졌습니다. 저도 처음에 IntelliJ 환경에서만 알고리즘 문제를 풀다가, 실제 코딩 테스트를 치렀을 때 당황했던 기억이 있습니다.  

저는 알고리즘 공부를 할 때 다양한 문제를 접하는 것이 중요하다고 생각해 주로 백준 플랫폼을 이용했습니다. 만약 백준에서도 프로그래머스처럼 로컬 개발 환경 없이 웹에서만 문제를 풀 수 있다면 코딩 테스트를 준비에 더 도움이 될 것이라 생각했고, 그렇게 **`Algo Plus`** 프로젝트를 구상하게 되었습니다.

### **오답 노트 기능**
Algo Plus 프로젝트는 삼성 청년 소프트웨어 아카데미(SAFFY) 활동을 하면서 7주 프로젝트로 진행한 프로젝트입니다. 제가 제안한 아이디어는 백준 문제 풀이 화면에 웹 IDE를 제공해, 실제 코딩 테스트 환경과 유사한 경험을 지원하는 것이었습니다. 그러나 6명이 7주동안 진행하기에는 프로젝트의 볼륨이 다소 작다는 의견이 나왔고, 이에 따라 코딩 테스트 학습에 실질적으로 도움이 되는 추가 기능을 고민하게 되었습니다.

팀 내에서 도출된 아이디어는 **오답 노트** 기능이었습니다. 사용자가 문제를 풀며 제출한 1~2개를 선택해, 코드의 변경점을 비교하고, 이에 대한 노트를 작성할 수 있도록 했습니다. 작성한 노트는 markdown 파일로 로컬에 저장하거나, 깃허브에 자동 업로드할 수 있도록 구현했습니다.

IT 취업 준비생들은 이미 깃허브를 적극적으로 활용해 자신이 푼 알고리즘 문제 코드를 관리하고 있습니다. 실제로 **`LeetHub`**나 **`BaekjoonHub`**와 같은 프로그램이 많은 사용자를 보유하고 있습니다. 우리는 단순히 코드를 저장하는 수준을 넘어, 코드 비교와 오답 노트 작성까지 지원하는 차별화된 기능을 제공하고자 했습니다.

<br/>

## **프로젝트 구조**
---

### **기능 소개**

- 실제 코딩테스트 환경 제공
  - 웹 IDE 제공
  - 다양한 프로그래밍 언어 지원 (C++, Java, Python, Javascript 등)
  - 테스트 케이스 자동 입력 및 결과 비교 기능
  - 테스트 케이스 추가 기능
- 오답 노트 기능
  - 제출 기록 중 2개 이하를 선택하여 markdown 형식의 오답 노트 기록 에디터 제공
  - 두 파일을 비교하여 변한 부분 (삭제된 부분 : 붉은색 / 추가된 부분 : 초록색) 표시
  - 코드에서 원하는 부분에 코멘트 기능
  - 오답 노트를 깃허브 레포지토리에 저장 기능

### **아키텍처**
![Algo Plus Architecture](/assets/img/post/algo-plus/architecture.png)

### **기술 스택**
- Front-end
  - Chrome Extension
  - React
  
- Infrastructure
  - [AWS Lambda](https://aws.amazon.com/lambda/){:target='_blank'}

- Libraries
  - [Prism Code Editor](https://github.com/FIameCaster/prism-code-editor){:target='_blank'}
  - [React Diff Viewer](https://github.com/praneshr/react-diff-viewer){:target='_blank'}

- API
  - [JDoodle Compile API](https://www.jdoodle.com/integrate-online-ide-compiler-api-plugins){:target='_blank'}
  - GitHub API

<br/>

## **프로젝트 진행 과정에서의 기술 선택과 고민**
---

### **크롬 확장 프로그램으로 개발한 이유?**

아키텍처와 기술 스택에서 알 수 있듯, **`Algo Plus`**는 웹 서비스가 아니라 크롬 확장 프로그램으로 개발되었습니다. 이렇게 설계한 이유는 기존 알고리즘 문제 해결 사이트의 사용자들이 사이트의 기능을 그대로 이용하면서, **`Algo Plus`**의 추가적인 기능을 바로 사용할 수 있도록 하기 위함입니다.  

크롬 확장 프로그램은 다음과 같은 장점이 있습니다.
- **<span style="background-color:yellow">기존 웹 사이트와의 자연스러운 통합</span>**: 기존 웹 사이트에 새로운 UI 요소를 추가하는 방식으로, 사용자는 별도의 사이트에 이동하지 않고도 새로운 기능을 사용 가능함
- **<span style="background-color:yellow">높은 사용자 접근성</span>**: 크롬 웹 스토어에서 쉽게 설치가 가능하고, 브라우저 툴바에서 바로 실행이 가능함

반면, 웹 서비스는 UI를 자유롭게 설계할 수 있다는 장점이 있지만, 다음과 같은 문제점이 있었습니다.
- **기존 웹 사이트의 기능 이용 제한**: '문제 불러오기, 문제 풀기, 제출' 등 이미 제공되는 기능을 새로 구현해야 하고, 여기에 추가적인 기능까지 개발해야 함
- **낯선 사용자 경험**: 기존 환경과 다르기 때문에 사용자가 적응하는 데 어려움을 겪을 수 있음

이러한 이유로, 사용자 경험과 개발 효율성을 모두 고려해 크롬 확장 프로그램 방식을 선택했습니다.

<br/>

### **백엔드 서버를 구축하지 않고, JDoodle API를 사용한 이유?**

**`Algo Plus`**는 프론트엔드를 별도로 배포하지 않았을 뿐만 아니라, 백엔드 서버도 따로 구축하지 않았습니다. 개발 과정에서 가장 고민이 컸던 부분은 **코드 컴파일** 기능이었습니다. 실전 코딩 테스트 환경을 제공하려면, 사용자가 작성한 코드를 실행해 테스트 케이스를 채점하는 기능이 핵심입니다.  

하지만 크롬 확장 프로그램은 Javascript(**`Algo Plus`**는 Typescript)로만 개발이 가능하기 때문에 Java, C++, Python 등 다양한 언어로 코드를 실행하는 것이 불가능했습니다. **이러한 한계로 인해 다양한 언어의 코드 실행 및 채점 기능을 구현하려면 별도의 백엔드 서버를 구축하거나, 외부 컴파일 API를 연동해야 했습니다.**

아래 표는 **백엔드 서버 구축**과 **외부 컴파일 API**의 주요 장단점을 비교한 것입니다.

|  |백엔드 서버 구축|외부 컴파일 API|
|------|---|---|
|**비용**|초기 구축 및 유지비가 높음|사용량 기반 과금| 
|**유지보수**|서버 관리 및 유지보수 필요|별도의 서버 관리 필요 없음|
|**외부 의존성**|자체 관리로 외부 의존성 적음|외부 서비스의 정책 변화에 민감|

서비스 초기에 사용자가 많지 않은 상황에서는, **<span style="background-color:yellow">서버를 직접 유지하는 비용을 부담하기보다는 사용량에 따라 요금이 부과되는 외부 컴파일 API를 활용하는 것이 더 적합하다고 판단했습니다.</span>**  
특히, 서버를 직접 운영할 경우 사용자가 빠르게 늘지 않으면 고정비 부담이 커질 수 있지만, 외부 API는 실제 사용량에 따라 유연하게 대응할 수 있다는 장점도 있습니다.

외부 컴파일 API는 여러 가지가 있었지만, **비용 등 다양한 측면을 종합적으로 비교한 끝에 최종적으로 JDoodle Compile API를 선택했습니다.**

![JDoodle](/assets/img/post/algo-plus/jdoodle.png)

### **AWS Lambda를 사용한 이유?**

백엔드 서버를 구축하지 않는 **서버리스** 구조로 설계를 했지만, 개발 과정에서 다음과 같은 문제점이 있었습니다.
1. **CORS 에러**: 브라우저 보안 정책으로 인해 JDoodle API를 호출할 때 교차 출처 요청이 차단되는 문제 발생
2. **Secret Key를 숨길 수 없음**: 크롬 확장 프로그램은 빌드 후 모든 코드가 사용자에게 노출되기 때문에 API Secret Key를 안전하게 숨길 수 없음

이러한 문제를 해결하고자, 중간에 AWS Lambda를 경유하도록 설계하였습니다. Lambda 함수를 사용함으로써 다음과 같은 이점을 얻을 수 있습니다.
- **<span style="background-color:yellow">Secret Key 보호</span>**: Lambda 환경 변수로 Secret Key를 안전하게 관리할 수 있어, 외부에 노출되지 않음
- **<span style="background-color:yellow">CORS 문제 해결</span>**: Lambda 함수에서 JDoodle API를 호출한 뒤, 크롬 확장 프로그램에는 Lambda의 응답만 전달하므로 CORS 정책 우회
- **<span style="background-color:yellow">서버리스 인프라</span>**: 별도의 서버를 운영하지 않고, 실제 요청이 발생할 때만 함수가 실행되어 비용이 효율적

이와 같이 AWS Lambda를 활용함으로써, 서버리스 구조의 장점을 유지하면서도 보안과 브라우저 환경에서 발생하는 기술적 문제를 효과적으로 해결할 수 있었습니다.  

#### **요청 출처 검증을 통한 보안 강화**
또한, Lambda 함수에서 요청의 출처를 검증함으로써, 악의적인 사용자가 JDoodle API 리소스를 무분별하게 사용하는 것을 방지할 수 있었습니다.  

브라우저는 확장 프로그램에서 발생한 요청에 자동으로 `origin` 헤더를 추가합니다. Lambda 함수에서는 이 헤더 값을 확인하여, **배포된 `Algo Plus` 확장 프로그램에서만 온 요청인지**를 검증했습니다. 만약 `origin` 값이 일치하지 않으면, JDoodle API를 호출하지 않고 요청을 즉시 거절하도록 설계했습니다. Lambda의 요청 횟수는 카운팅되기는 하지만, AWS Lambda는 무료 제공량이 넉넉해 비용 부담이 크지 않을 것으로 판단했습니다.

> 월 100만 건 요청 기준 Lambda 비용은 $0.20 미만으로, 서버 유지비/JDoodle API 구독 비용보다 훨씬 저렴


![Lambda Flow](/assets/img/post/algo-plus/lambda-flow.png)

참고로 Lambda 함수에서 출처를 검증하는 로직은 다음과 같습니다.
```python
def validate_request(event):
    extension_id = 'egomkekembecbmlmmoflfdaobgkliiid'   # Algo Plus ID
    expected_origin = f'chrome-extension://{extension_id}'

    origin = event.get('headers', {}).get('origin', '')  # 헤더의 Origin 정보
    is_from_algoplus_extension = (origin == expected_origin)

    return is_from_algoplus_extension
```

---

**관련 게시글**

- [Algo Plus: AWS Lambda 함수 개선을 통한 개발 편의성 향상](/h-spear/posts/algoplus-secret-key/)