# 형성평가 학생 응답 수집 설계

**날짜** 2026-08-14
**적용 대상** `G-teacher-toolkit` — `features/quiz`
**관련 문서** [`2026-08-12-teacher-toolkit-design.md`](2026-08-12-teacher-toolkit-design.md),
[`../../firebase-guide.md`](../../firebase-guide.md),
`G-classroom-suite/docs/superpowers/specs/2026-08-13-cross-window-sync-design.md`

---

## 1. 무엇을 만드나

학생이 QR이나 6자 코드로 들어와 **모둠 단위로 답을 제출**하고, 교사 화면과 전자칠판에
집계가 실시간으로 뜬다.

지금은 교사가 칠판에서 모둠 버튼을 눌러 수기로 채점한다.
`quizCore.ts`의 `isCorrect` · `acceptedAnswers` · `normalizeAnswer`는 테스트 21개를 갖춘 채
**화면 어디서도 쓰이지 않는다.** 이 기능이 그 채점 엔진의 첫 호출자다.

### 1.1 이 기능은 Firebase를 붙여야 학생 폰이 들어온다

저장소에는 Firebase 코드가 없다. 연수생이 마지막 단계에서 붙인다.
그래서 이 기능은 **Firebase를 붙여야만 완성되는 첫 기능**이 된다.
지금까지 "Firebase를 왜 붙이나"의 답은 여러 기기에서 자료를 보는 것뿐이었다.

다만 Firebase 없이도 **흐름 전체가 동작해야 한다**(§3.1). 그래야 지금 만들고 검증할 수 있고,
연수 중에 한 대의 PC로 시연할 수 있다.

---

## 2. 정해진 것

| 결정 | 값 | 근거 |
|---|---|---|
| 제출 단위 | **모둠** | 지금 데이터 모델(모둠별 점수)과 맞고, 이름을 받지 않아 개인정보가 생기지 않는다 |
| 진행 주도 | **교사 주도 + 학생 주도 둘 다** | 수업 중 일제 형성평가와 모둠 자습을 모두 쓴다 |
| 중복 제출 | **마지막 제출로 덮어쓰기** | 오타를 고치고 모둠원끼리 상의해 바꿀 수 있다 |

두 모드의 차이는 **"지금 답할 수 있는 문제가 무엇인가"** 하나뿐이다.
세션 문서의 `openQuestionIds` 한 필드로 표현하고, 학생 화면·집계·칠판은 공유한다.
두 시스템이 아니라 한 시스템에 분기 하나다.

---

## 3. 이음매 — `QuizSessionRelay`

세션과 학생 응답은 **`ToolkitData`에 넣지 않는다.**
교사 혼자 보는 자료가 아니고(학생이 쓴다), 수업이 끝나면 버리며, 백업 파일에 들어갈 이유가 없다.

`StorageAdapter`와 나란한 두 번째 인터페이스를 둔다.

```ts
export interface QuizSessionRelay {
  /** 학생 폰이 들어올 수 있는가. false면 화면이 안내로 바뀐다. */
  readonly isAvailable: boolean;

  open(init: QuizSessionInit): Promise<{ code: string }>;
  update(code: string, patch: QuizSessionPatch): Promise<void>;
  close(code: string): Promise<void>;
  /**
   * 만료된 내 세션을 지운다. 앱을 열 때 한 번 부른다.
   * ownerKey는 Firestore 구현에서 로그인한 교사의 uid,
   * Local 구현에서는 이 브라우저의 고정 id다.
   */
  sweepExpired(ownerKey: string): Promise<void>;

  /** 교사 화면: 응답이 들어오면 부른다. 해제 함수를 돌려준다. */
  watchResponses(code: string, listener: (rows: QuizResponse[]) => void): () => void;
  /** 학생 화면: 세션 상태를 구독한다. 없어졌으면 null. */
  watchSession(code: string, listener: (view: QuizSessionView | null) => void): () => void;
  submit(code: string, input: QuizResponseInput): Promise<void>;
}
```

구독 메서드가 해제 함수를 돌려주는 모양은 `StorageAdapter.subscribe`와 같다.

### 3.1 구현 셋

| 구현 | 언제 | 학생 접속 | `isAvailable` |
|---|---|---|---|
| `LocalSessionRelay` | Firebase 없음 (기본) | 같은 브라우저의 다른 탭 | `false` |
| `FirestoreSessionRelay` | 연수생이 Firebase를 붙인 뒤 | **학생 폰** | `true` |
| `MemorySessionRelay` | 테스트 | — | `true` |

`LocalSessionRelay`는 localStorage와 `storage` 이벤트를 쓴다.
창 간 동기화에서 이미 검증한 방식이라 새로 만들 것이 없다.
교사가 세션을 열고, 다른 탭이 학생 화면이 되어 답을 내고, 칠판에 집계가 뜬다.
**Firebase를 붙이는 일은 이 어댑터를 갈아 끼우는 것뿐이다.**

`isAvailable`이 `false`면 QR을 보여 주지 않고
"학생 폰으로 받으려면 Firebase를 붙이세요"와 안내 문서 링크, 그리고
"이 브라우저에서 시험해 보기"(학생 화면을 새 탭으로 여는) 버튼을 보여 준다.

어느 구현을 쓸지는 `main.tsx`에서 고른다. `StorageAdapter`를 고르는 자리와 같다.

---

## 4. 데이터 모델

Firestore **최상위**에 둔다. `teachers/{uid}` 아래에 두면 학생이 읽을 수 없다.

```
quizSessions/{code}
  code            6자 (Crockford Base32 — 0/O, 1/I/L 같은 헷갈리는 글자 제외)
  ownerUid        교사
  quizSetId, title
  mode            'teacher' | 'student'
  openQuestionIds string[]      ← 두 모드의 유일한 차이
  questions       [{ id, type, text, choices }]
  teams           string[]
  open            boolean
  createdAt, expiresAt

  responses/{questionId}__t{teamIndex}
    teamIndex  number
    answer     string
    submittedAt
```

못 박을 것 셋.

1. **정답을 세션 문서에 넣지 않는다.** 학생이 문서를 그대로 읽으므로 정답이 같이 가면 안 된다.
   `questions`에는 `answer`와 `explanation`을 넣지 않는다. 채점은 교사 쪽에서만 한다.
2. **응답 문서 id가 `(문제, 모둠)`이다.** 마지막 제출이 그대로 덮어쓰므로 중복 처리 코드가 없다.
   모둠 이름 대신 **인덱스**를 쓴다. 이름은 교사가 바꿀 수 있고 문서 id에 못 쓰는 글자가 들어갈 수 있다.
3. **코드는 6자다.** 32⁶ ≈ 10억 가지라 찍어서 들어올 수 없고, QR을 못 읽는 학생은 코드만 입력한다.
   생성 시 이미 있는 코드인지 확인하고, 겹치면 다시 만든다(최대 5회).

---

## 5. 화면

### 5.1 교사 — `/quiz`

`학생 응답 받기` 버튼. 누르면 모드를 고르고 세션을 연다.
열린 뒤에는 **QR 코드**, **6자 코드**, **모둠별 제출 현황**(`3/4 모둠 제출`), `받기 종료` 버튼.

교사 화면에서는 **정답 공개 전에도 모둠별 답을 볼 수 있다.** 교사는 어느 모둠이 무엇으로
답했는지 보고 수업을 이어갈지 판단해야 한다. 감추는 것은 칠판뿐이다(§5.2).

QR은 새 의존성 `qrcode`로 만든다(약 50KB). 화면 안에서 SVG로 그린다.

### 5.2 전자칠판 — `/board/quiz`

지금 화면 그대로에 **제출 현황 표시**만 더한다.

- 정답 공개 전에는 **누가 냈는지만** 보인다. 모둠 이름 옆의 점.
  답을 미리 보여 주면 베낀다.
- 정답 공개 후에 모둠별 정오가 드러난다.

board 타이포 스케일을 그대로 쓴다. 뒷자리에서 읽혀야 한다.

### 5.3 학생 — `/join/:code`

`AppShell` 밖의 독립 라우트다. `/board/:feature`와 같은 자리에 둔다.
학생 폰에는 교사용 내비게이션이 필요 없다.
다른 화면과 같이 `lazy`로 나눠 교사용 화면 코드는 내려받지 않게 한다.

흐름: 모둠 고르기 → 답 제출 → 제출됨 표시(다시 낼 수 있음).

- 교사 주도: 열린 문제 **하나**를 보여 준다. 교사가 넘기면 화면이 따라 바뀐다.
- 학생 주도: 문제 **목록**을 보여 주고 각자 속도로 낸다.
- 세션이 닫히면 "받기가 끝났습니다"로 바뀐다.

폰 화면(360px)을 기준으로 짠다. 고른 모둠은 이 기기의 localStorage에 남겨
새로고침해도 다시 고르지 않게 한다.

---

## 6. 채점 — 교사가 최종 결정권을 갖는다

응답이 들어오면 `isCorrect`가 채점해 `run.correctTeamsByQuestion`을 채운다.

**교사가 칠판에서 누른 수기 채점은 덮지 않는다.**
단답형은 오타·표현 차이로 기계 채점이 틀릴 수 있고,
그때 교사가 고친 것이 조용히 되돌아가면 안 된다.

규칙: 자동 채점은 **교사가 아직 손대지 않은 `(문제, 모둠)`** 에만 적용한다.
그래서 `QuizRun`에 손댄 자리를 기억하는 필드를 하나 더한다.

```ts
/** 교사가 직접 정오를 누른 (문제 id → 모둠 이름[]). 자동 채점이 건드리지 않는다. */
manualTeamsByQuestion: Record<string, string[]>;
```

**한 번 누르면 그 자리는 영구히 교사 것이다.** 눌렀다가 다시 눌러 해제해도 마찬가지다.
"교사가 오답으로 되돌린 것"과 "아직 안 본 것"은 다르고,
전자를 자동 채점이 다시 정답으로 만들면 그게 바로 조용히 덮어쓰는 일이다.

기존 저장 자료에는 이 필드가 없으므로 `parseToolkitData`가 빈 객체로 채운다.

---

## 7. 보안 규칙

```
match /quizSessions/{code} {
  allow read: if resource.data.open == true;
  allow create: if request.auth.uid == request.resource.data.ownerUid;
  allow update, delete: if request.auth.uid == resource.data.ownerUid;

  match /responses/{responseId} {
    allow create, update: if request.auth != null
      && get(/databases/$(database)/documents/quizSessions/$(code)).data.open == true;
    allow read: if request.auth.uid ==
      get(/databases/$(database)/documents/quizSessions/$(code)).data.ownerUid;
  }
}
```

- 학생은 **익명 인증**으로 들어온다(Spark 무료). 연수생이 Firebase 콘솔에서 켜야 한다.
- 학생은 응답을 **읽지 못한다.** 남의 답을 베낄 수 없다.
- `request.auth != null`만으로 끝내지 않는다. 세션이 열려 있어야 쓸 수 있다.
  `G-call-teachers`의 열린 규칙 패턴을 되풀이하지 않는다.
- `get()`은 규칙 안에서 읽기 1회를 쓴다. 응답 1건당 1회이므로 무료 한도에서 문제없다.

이 규칙은 `docs/firebase-guide.md`의 4단계에 추가한다.

---

## 8. 수명과 정리

Cloud Functions를 못 쓰므로 청소는 클라이언트가 한다.

- 교사가 `받기 종료`를 누르면 세션과 응답을 **지운다.**
- `expiresAt`은 **3시간**. 수업 한 차시를 훨씬 넘고, 잊고 닫지 않아도 오래 남지 않는다.
- 앱을 열 때 `sweepExpired`로 만료된 **내** 세션을 지운다.
- 세션이 사라지면 학생 화면은 `watchSession`이 `null`을 받아 "받기가 끝났습니다"로 바뀐다.

**세션을 지워도 수업 기록은 남는다.** 채점 결과는 이미 `ToolkitData`의 `quizRun`에 반영돼 있고,
교사가 `퀴즈 끝내기`를 누르면 `QuizResult`로 저장된다.
세션은 학생과 주고받는 임시 통로일 뿐이다.

---

## 9. 테스트

**순수 로직** (`MemorySessionRelay`)
- 같은 모둠이 다시 내면 마지막 답이 남는다
- 자동 채점이 교사 수기 채점을 덮지 않는다
- 교사가 손대지 않은 자리는 자동 채점이 채운다
- 세션이 닫힌 뒤 제출은 거부된다
- 교사 주도 모드에서 열린 문제는 현재 문제 하나뿐이다
- 학생 주도 모드에서는 전체 문제가 열린다
- 세션 문서에 정답이 들어가지 않는다
- 코드가 겹치면 다시 만든다

**`LocalSessionRelay`**
- 다른 탭의 제출이 교사 쪽 리스너에 도착한다
- 세션이 닫히면 학생 쪽 리스너가 `null`을 받는다
- 해제하면 더는 오지 않는다

**브라우저**
- 탭 두 개로 교사·학생 흐름을 확인한다
- 칠판에 제출 현황이 뜨고, 정답 공개 전에는 정오가 보이지 않는다

---

## 10. 범위 밖

개인 기명 제출 · 응답 시간 측정 · 학생 재접속 신원 유지 · 이미지 문제 ·
학생 화면 실시간 순위표 · 수업 진행판(lesson)으로의 확장.

---

## 11. 새 의존성

`qrcode` 하나. 다른 것은 늘리지 않는다.
