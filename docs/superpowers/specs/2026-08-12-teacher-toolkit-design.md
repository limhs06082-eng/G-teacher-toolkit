# 「수업·업무 도구함」 통합 앱 — 설계 문서

- 작성일: 2026-08-12
- 저장소: `G-teacher-toolkit` (신규)
- 1단계: [`G-classroom-suite`](https://github.com/limhs06082-eng/G-classroom-suite) — 완료

---

## 1. 통합 대상

학생 명단이 **필요 없는** 4개 앱을 묶는다.

| 원본 저장소 | 통합 후 | 규모 |
|---|---|---|
| `G-lesson-flow-board` | `features/lesson` 수업 진행 | 4,295줄 |
| `G-formative-quiz` | `features/quiz` 형성평가 | 8,111줄 |
| `G-task-manager` | `features/task` 업무 체크리스트 | 6,823줄 |
| `G-school-message-templates` | `features/message` 문구 템플릿 | 5,696줄 |

합계 약 24,900줄.

### 1단계와 무엇이 다른가

1단계 `G-classroom-suite`의 통합 근거는 **학생 명단 공유**였다. 여기에는 그런 축이 없다.
네 앱이 공유하는 것은 **학교·교사 이름** 정도다.

그럼에도 묶는 이유는 하나다. **fork와 배포 횟수를 줄이는 것.**
연수 현장에서 fork + Vercel 배포는 1인당 5~10분씩 걸린다. 4번이 1번이 된다.

따라서 이 저장소의 통합은 1단계보다 **얕다.** 기능끼리 데이터를 주고받지 않고,
공통 셸(레이아웃·저장·백업·디자인)만 공유한다. 억지로 엮지 않는다.

---

## 2. 아키텍처

1단계에서 검증된 구조를 그대로 쓴다.

```
G-teacher-toolkit/
├─ api/
│  └─ refine.ts              Vercel 서버리스 — Gemini 문장 다듬기
├─ src/
│  ├─ app/                   라우터·레이아웃·오류 격리
│  ├─ shared/
│  │  ├─ domain/             ToolkitData 타입과 불변조건
│  │  ├─ storage/            StorageAdapter · LocalStorageAdapter · 백업
│  │  ├─ state/              ToolkitDataProvider
│  │  └─ ui/                 공통 컴포넌트·디자인 토큰·BoardScreen
│  └─ features/
│     ├─ home/               도구 4개 요약
│     ├─ lesson/             수업 진행판
│     ├─ quiz/               형성평가·퀴즈
│     ├─ task/               업무 체크리스트
│     └─ message/            문구 템플릿
└─ tests/
```

### 2.1 shared 계층은 1단계에서 복사한다

`shared/ui`와 `shared/storage`는 `G-classroom-suite`의 것을 복사해 온다.
npm 패키지로 빼지 않는 이유:

- 연수생이 **fork**해서 쓴다. 별도 패키지를 만들면 그것도 함께 관리해야 한다.
- Firebase를 붙이는 주체가 **AI 스튜디오 에이전트**다. 저장소 하나 안에서
  모든 코드가 보여야 안전하게 고칠 수 있다.

대가로 두 저장소에 같은 코드가 생긴다. 그 대가를 받아들이고,
복사한 파일 머리에 출처를 적어 둔다.

### 2.2 라우팅

| 경로 | 화면 |
|---|---|
| `/` | 홈 — 도구 4개 요약 |
| `/lesson` | 수업 진행판 |
| `/quiz` | 형성평가·퀴즈 |
| `/task` | 업무 체크리스트 |
| `/message` | 문구 템플릿 |
| `/settings` | 설정·백업 |
| `/board/:feature` | 전자칠판 (lesson·quiz) |

---

## 3. 원본에서 반드시 고칠 것

### 3.1 저장 키 충돌 — `G-formative-quiz`

원본 퀴즈 앱은 접두사 없는 키를 쓴다.

```
'quizSets'  'quizResults'  'settings'  'activeQuizSession'
```

특히 `'settings'`는 어떤 앱이나 브라우저 확장이 써도 이상하지 않은 이름이다.
같은 origin에 다른 앱과 함께 배포되면 서로의 자료를 덮어쓴다.

**통합본은 전부 `teacher-toolkit:v1:` 접두사를 강제한다.**
원본 키가 있으면 설정 화면에서 가져올 수 있게 하되, 원본 키는 지우지 않는다.

### 3.2 express 서버 — `G-school-message-templates`

원본은 `server.ts`(express)로 `/api/test-key`와 `/api/refine`을 제공한다.
Vercel에서는 서버를 상주시킬 수 없으므로 **서버리스 함수**로 옮긴다.

```
server.ts (express, 상주)  →  api/refine.ts (Vercel Function)
```

**Gemini 키는 환경변수로 요구하지 않는다.** 원본도 `customApiKey || process.env.GEMINI_API_KEY`
순서로 읽고 있었다. 통합본은 사용자가 설정 화면에 넣은 키만 쓴다.
fork 직후 환경변수 없이 배포되어야 한다는 원칙(1단계 §12.3)을 그대로 지킨다.

AI 다듬기는 **선택 기능**이다. 키가 없으면 그 버튼만 숨고 나머지는 전부 동작한다.

### 3.3 Google Fonts CDN — `G-formative-quiz`

원본 퀴즈만 외부 폰트를 불러온다. 통합본은 시스템 폰트로 통일한다.
학교 네트워크가 외부를 막는 경우가 있고, 그때 글꼴이 깨진 채로 수업이 시작된다.

### 3.4 타이머 — `G-lesson-flow-board`

1단계에서 확인한 것과 같은 문제다. `setInterval`로 초를 깎으면
탭이 백그라운드일 때 브라우저가 타이머를 늦춘다.
**끝날 시각을 기억하고 현재 시각과의 차이를 계산**하는 방식으로 옮긴다.

---

## 4. 데이터 모델

```ts
interface ToolkitData {
  schemaVersion: number;
  profile: { schoolName: string; teacherName: string; grade: string; className: string };

  lessonTemplates: LessonTemplate[];   // 수업 흐름 틀
  activeLessonId: string | null;

  quizSets: QuizSet[];                 // 문제 세트
  quizResults: QuizResult[];           // 진행 결과

  tasks: TaskItem[];                   // 업무·회의 안건
  messageTemplates: MessageTemplate[]; // 개인 문구 템플릿
  messageFavorites: string[];          // 기본 템플릿 즐겨찾기
}
```

프로필의 `grade`·`className`은 문구 템플릿의 자동 치환에 쓰인다
(`{학교}`, `{학년}`, `{반}`, `{교사}`). 1단계와 달리 학생 명단은 없다.

---

## 5. 작업 순서

| 단계 | 내용 | 완료 기준 |
|---:|---|---|
| 0 | 설계 문서 (이 문서) | — |
| 1 | 스캐폴딩 + shared 계층 이식 | `npm run verify` 통과, 빈 셸 렌더 |
| 2 | `features/lesson` 수업 진행판 + 전자칠판 | 단계 진행·타이머 동작 |
| 3 | `features/quiz` 형성평가 + 전자칠판 | 문제 출제·진행·채점 동작 |
| 4 | `features/task` 업무 체크리스트 | 업무 등록·마감·필터 동작 |
| 5 | `features/message` 문구 템플릿 + `api/refine` | 치환·복사 동작, AI는 선택 |
| 6 | 홈 요약 + 원본 데이터 가져오기 + README | fork→배포 리허설 |

각 단계는 **타입 검사 + 테스트 + 빌드**를 통과해야 커밋한다.

---

## 6. 비범위

- 퀴즈 학생 기기 참여(Firebase 필요) — 원본 기획의 심화 기능. 3단계에서 검토
- 학생 명단 연동 — 이 저장소에는 명단이 없다. 필요하면 `G-classroom-suite`를 쓴다
- 두 저장소 간 자료 공유
