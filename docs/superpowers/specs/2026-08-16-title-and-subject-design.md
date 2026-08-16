# 이름 고치기와 과목 설계

**날짜** 2026-08-16
**적용 대상** `G-teacher-toolkit` — `features/lesson` · `features/quiz`
**계기** [`../../reference/missing-features-audit.md`](../../reference/missing-features-audit.md) 중간 우선순위 둘

---

## 1. 무엇을 고치나

| 지금 | 문제 |
|---|---|
| `renameTemplate`·`renameSet`이 훅에 있는데 부르는 곳이 없다 | 이름을 한 번 지으면 못 고친다 |
| `LessonTemplate.subject`·`QuizSet.subject`를 아무도 안 읽는다 | `legacyImport`가 원본에서 가져오는데 어디에도 안 보인다 |

둘은 한 벌이다. **이름과 과목은 "이게 무슨 자료인가"를 말하는 이름표**이고,
고치는 자리도 보이는 자리도 같아야 한다.

---

## 2. 편집 모달 안에서 고친다

두 화면 모두 편집 모달이 이미 있다 — `StageEditor`, `QuestionEditor`.
그 모달 맨 위에 이름·과목 입력칸을 둔다.

**카드에 버튼을 더하지 않는다.** 카드에는 이미 삭제·시작·편집 셋이 있다.
넷째를 넣으면 좁은 화면에서 줄이 바뀌고, 어느 것이 주된 조작인지 흐려진다.

모달 제목도 손본다. `단계 편집`·`문제 편집`은 안에서 이름을 고칠 수 있게 된
뒤로는 좁은 이름이다.

| 지금 | 바꿀 것 |
|---|---|
| `{제목} 단계 편집` | `{제목} 편집` |
| `{제목} 문제 편집` | `{제목} 편집` |

---

## 3. 과목은 자유 입력에 고르기를 곁들인다

`<input list>`와 `<datalist>`를 쓴다. 직접 칠 수도 있고 목록에서 고를 수도 있다.
HTML이 이미 하는 일이라 코드가 짧고, 목록에 없는 과목(방과후·동아리 등)도 막지 않는다.

```ts
// src/shared/subjects.ts
export const COMMON_SUBJECTS: readonly string[];  // 국어·수학·… 초등 교과
export const MAX_SUBJECT_LENGTH = 12;
export function normalizeSubject(value: string): string;
```

**과목은 비어 있어도 된다.** 과목이 없는 수업 흐름(학급 회의, 상담 주간)이 정상이다.
이름과 규칙이 다르다 — 이름은 비면 안 고치고, 과목은 비우면 지운다.

그래서 함수도 따로 둔다. `renameTemplate`을 `updateInfo(id, {title?, subject?})`로
합치지 않는다. **규칙이 다른 둘을 한 함수에 넣으면 어느 쪽 규칙이 적용되는지
부르는 쪽에서 알 수 없다.**

```ts
setTemplateSubject: (templateId: string, subject: string) => void;
setQuizSubject: (setId: string, subject: string) => void;
```

---

## 4. 카드에 배지로 보인다

과목이 있으면 카드 제목 옆에 작은 배지. 없으면 아무것도 안 그린다.

과목으로 걸러 보는 기능은 만들지 않는다. 세트가 수십 개가 되기 전에는
눈으로 찾는 것이 더 빠르고, 필터는 "지금 무엇이 걸려 있나"를 또 보여 줘야 한다.

---

## 5. 테스트

**`normalizeSubject`**
- 앞뒤 공백을 다듬는다
- 빈 값은 빈 값으로 둔다 (과목 없음이 정상)
- 너무 길면 자른다

**훅**
- 이름을 고치면 저장된다
- **빈 이름으로는 안 고친다** — 이름 없는 세트는 목록에서 고를 수 없다
- 과목을 비우면 지워진다
- 이름·과목을 고쳐도 단계·문제는 그대로다

**화면**
- 편집 모달에 이름·과목 입력칸이 있다
- 과목이 있으면 카드에 배지가 뜨고 없으면 안 뜬다

---

## 6. 범위 밖

과목으로 걸러 보기 · 과목별 색 · 과목 자동 채우기 ·
`goTo`·`startedAt`(낮음, 만들지 않기를 권함).
