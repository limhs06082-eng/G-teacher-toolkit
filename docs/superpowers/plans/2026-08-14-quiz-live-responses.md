# 형성평가 학생 응답 수집 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 QR·6자 코드로 들어와 모둠 단위로 답을 내면, 교사 화면과 전자칠판에 집계가 실시간으로 뜬다.

**Architecture:** `StorageAdapter`와 나란한 `QuizSessionRelay` 이음매를 두고 구현을 셋(Memory·Local·Firestore) 둔다. 세션과 응답은 `ToolkitData`에 넣지 않는다. `LocalSessionRelay`가 `storage` 이벤트를 쓰므로 Firebase 없이도 흐름 전체가 동작하고 지금 검증할 수 있다.

**Tech Stack:** TypeScript 5.8 (`strict`, `noUncheckedIndexedAccess`), React 19, react-router 7, Vitest + jsdom + @testing-library/react, 신규 의존성 `qrcode`

**설계 문서:** [`../specs/2026-08-14-quiz-live-responses-design.md`](../specs/2026-08-14-quiz-live-responses-design.md)

## Global Constraints

- **기능 코드는 localStorage를 직접 부르지 않는다.** 단, `LocalSessionRelay`는 저장 계층이므로 예외다.
- **필수 환경변수를 만들지 않는다.** fork 직후 설정 없이 배포·동작해야 한다.
- **세션 문서에 정답을 넣지 않는다.** `QuizSessionQuestion`에 `answer`·`explanation`이 없다.
- **자동 채점은 교사가 손댄 `(문제, 모둠)`을 건드리지 않는다.** 껐다 켜도 영구히 교사 것이다.
- 저장 키는 `teacher-toolkit:v1:` 접두사를 강제한다.
- 각 태스크는 `npm run verify`(타입 검사 → 테스트 → 빌드)를 통과해야 커밋한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `src/features/quiz/session/types.ts` | 세션·응답 타입 (신규) |
| `src/features/quiz/session/sessionCore.ts` | 순수 로직 — 코드 생성, 열린 문제, 정답 제거, 자동 채점 병합 (신규) |
| `src/features/quiz/session/QuizSessionRelay.ts` | 인터페이스 + 전역 교체 지점 (신규) |
| `src/features/quiz/session/MemorySessionRelay.ts` | 테스트용 (신규) |
| `src/features/quiz/session/LocalSessionRelay.ts` | 기본 구현, localStorage + storage 이벤트 (신규) |
| `src/features/quiz/session/useQuizSession.ts` | 교사 화면용 훅 (신규) |
| `src/features/quiz/JoinPage.tsx` | 학생 화면 (신규) |
| `src/shared/domain/types.ts` | `QuizRun.manualTeamsByQuestion` 추가 |
| `src/shared/storage/schema.ts` | 같은 필드 파싱 |
| `src/features/quiz/useQuiz.ts` | `markCorrect`가 수기 표시를 남긴다 |
| `src/features/quiz/QuizPage.tsx` | 응답 받기 패널 |
| `src/features/quiz/QuizBoard.tsx` | 제출 현황 표시 |
| `src/app/router.tsx` | `/join/:code` 라우트 |
| `docs/firebase-guide.md` | `FirestoreSessionRelay` 지시문 + 보안 규칙 |

---

## Task 1: 세션 타입과 순수 로직

**Files:**
- Create: `src/features/quiz/session/types.ts`, `src/features/quiz/session/sessionCore.ts`
- Test: `tests/quiz/sessionCore.test.ts`

**Interfaces (Produces):**
- `QuizSessionMode = 'teacher' | 'student'`
- `QuizSessionQuestion { id; type: QuestionType; text: string; choices: string[] }`
- `QuizSessionInit { ownerKey; quizSetId; title; mode; openQuestionIds; questions; teams; expiresAt }`
- `QuizSessionView { code; title; mode; openQuestionIds; questions; teams; open }`
- `QuizSessionPatch { openQuestionIds?; teams?; open? }`
- `QuizResponseInput { questionId; teamIndex; answer }`
- `QuizResponse extends QuizResponseInput { submittedAt: string }`
- `createSessionCode(isTaken: (code: string) => boolean, random?: () => number): string`
- `openQuestionIdsFor(set: QuizSet, mode: QuizSessionMode, questionIndex: number): string[]`
- `toSessionQuestions(set: QuizSet): QuizSessionQuestion[]`
- `mergeAutoGrading(run: QuizRun, set: QuizSet, responses: readonly QuizResponse[]): Record<string, string[]>`
- `submittedTeamCount(responses: readonly QuizResponse[], questionId: string): number`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `tests/quiz/sessionCore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  createSessionCode,
  mergeAutoGrading,
  openQuestionIdsFor,
  submittedTeamCount,
  toSessionQuestions,
} from '../../src/features/quiz/session/sessionCore';
import type { QuizResponse } from '../../src/features/quiz/session/types';
import { createQuestion, createQuizSet } from '../../src/shared/domain/factories';
import type { QuizRun } from '../../src/shared/domain/types';

const NOW = '2026-08-14T09:00:00.000Z';

const set = createQuizSet(
  {
    id: 'qs-1',
    title: '퀴즈',
    questions: [
      createQuestion({ id: 'q1', type: 'ox', text: '지구는 둥글다', answer: 'O' }),
      createQuestion({ id: 'q2', type: 'short', text: '수도는?', answer: '서울' }),
    ],
  },
  NOW,
);

function runWith(overrides: Partial<QuizRun> = {}): QuizRun {
  return {
    quizSetId: 'qs-1',
    questionIndex: 0,
    correctTeamsByQuestion: {},
    manualTeamsByQuestion: {},
    revealed: false,
    teams: ['1모둠', '2모둠'],
    startedAt: NOW,
    ...overrides,
  };
}

const response = (questionId: string, teamIndex: number, answer: string): QuizResponse => ({
  questionId,
  teamIndex,
  answer,
  submittedAt: NOW,
});

describe('createSessionCode', () => {
  it('헷갈리는 글자를 쓰지 않는 6자를 만든다', () => {
    const code = createSessionCode(() => false, () => 0.5);

    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[0-9A-Z]{6}$/);
    expect(code).not.toMatch(/[OIL]/); // 0·1과 헷갈린다
  });

  it('이미 쓰는 코드면 다시 만든다', () => {
    const seen: string[] = [];
    let calls = 0;
    const values = [0.1, 0.9];
    const code = createSessionCode(
      (candidate) => {
        seen.push(candidate);
        return seen.length === 1; // 첫 번째만 충돌
      },
      () => values[calls++ % values.length] ?? 0.5,
    );

    expect(seen).toHaveLength(2);
    expect(code).toBe(seen[1]);
  });
});

describe('openQuestionIdsFor', () => {
  it('교사 주도면 지금 문제 하나만 연다', () => {
    expect(openQuestionIdsFor(set, 'teacher', 1)).toEqual(['q2']);
  });

  it('학생 주도면 전체를 연다', () => {
    expect(openQuestionIdsFor(set, 'student', 0)).toEqual(['q1', 'q2']);
  });

  it('범위를 벗어난 번호에도 깨지지 않는다', () => {
    expect(openQuestionIdsFor(set, 'teacher', 99)).toEqual([]);
  });
});

describe('toSessionQuestions', () => {
  it('정답과 해설을 빼고 내보낸다', () => {
    // 학생이 세션 문서를 그대로 읽는다. 정답이 같이 가면 안 된다.
    const questions = toSessionQuestions(set);

    expect(questions).toEqual([
      { id: 'q1', type: 'ox', text: '지구는 둥글다', choices: [] },
      { id: 'q2', type: 'short', text: '수도는?', choices: [] },
    ]);
    expect(JSON.stringify(questions)).not.toContain('서울');
  });
});

describe('mergeAutoGrading', () => {
  it('맞힌 모둠을 정답으로 넣는다', () => {
    const next = mergeAutoGrading(runWith(), set, [response('q1', 0, 'O')]);

    expect(next['q1']).toEqual(['1모둠']);
  });

  it('틀린 모둠은 넣지 않는다', () => {
    const next = mergeAutoGrading(runWith(), set, [response('q1', 1, 'X')]);

    expect(next['q1'] ?? []).toEqual([]);
  });

  it('단답형은 기존 채점 규칙을 그대로 쓴다', () => {
    const next = mergeAutoGrading(runWith(), set, [response('q2', 0, ' 서 울 ')]);

    expect(next['q2']).toEqual(['1모둠']);
  });

  it('교사가 손댄 자리는 건드리지 않는다', () => {
    // 교사가 오답으로 되돌린 것과 아직 안 본 것은 다르다.
    const run = runWith({
      correctTeamsByQuestion: { q1: [] },
      manualTeamsByQuestion: { q1: ['1모둠'] },
    });

    const next = mergeAutoGrading(run, set, [response('q1', 0, 'O')]);

    expect(next['q1']).toEqual([]);
  });

  it('교사가 정답으로 둔 자리도 자동 채점이 지우지 않는다', () => {
    const run = runWith({
      correctTeamsByQuestion: { q1: ['2모둠'] },
      manualTeamsByQuestion: { q1: ['2모둠'] },
    });

    const next = mergeAutoGrading(run, set, [response('q1', 1, 'X')]);

    expect(next['q1']).toEqual(['2모둠']);
  });

  it('없는 모둠 번호는 무시한다', () => {
    const next = mergeAutoGrading(runWith(), set, [response('q1', 9, 'O')]);

    expect(next['q1'] ?? []).toEqual([]);
  });

  it('응답이 없는 문제에는 빈 항목을 만들지 않는다', () => {
    const next = mergeAutoGrading(runWith(), set, []);

    expect(Object.keys(next)).toEqual([]);
  });
});

describe('submittedTeamCount', () => {
  it('그 문제에 답한 모둠 수를 센다', () => {
    const rows = [response('q1', 0, 'O'), response('q1', 1, 'X'), response('q2', 0, '서울')];

    expect(submittedTeamCount(rows, 'q1')).toBe(2);
    expect(submittedTeamCount(rows, 'q2')).toBe(1);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/quiz/sessionCore.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 타입을 만든다**

Create `src/features/quiz/session/types.ts`:

```ts
import type { QuestionType } from '../../../shared/domain/types';

/**
 * 학생 응답 수집 세션의 자료형.
 *
 * 세션과 응답은 ToolkitData에 넣지 않는다. 학생이 쓰는 자료이고,
 * 수업이 끝나면 버리며, 백업 파일에 들어갈 이유가 없다.
 */

export type QuizSessionMode = 'teacher' | 'student';

/**
 * 학생에게 보내는 문제.
 *
 * **정답과 해설이 없다.** 학생이 세션 문서를 그대로 읽으므로
 * 정답이 같이 가면 주소창만으로 답이 보인다.
 */
export interface QuizSessionQuestion {
  id: string;
  type: QuestionType;
  text: string;
  choices: string[];
}

export interface QuizSessionInit {
  ownerKey: string;
  quizSetId: string;
  title: string;
  mode: QuizSessionMode;
  openQuestionIds: string[];
  questions: QuizSessionQuestion[];
  teams: string[];
  /** ISO. 이 시각이 지나면 청소 대상이다. */
  expiresAt: string;
}

/** 학생 화면이 보는 세션 상태 */
export interface QuizSessionView {
  code: string;
  title: string;
  mode: QuizSessionMode;
  openQuestionIds: string[];
  questions: QuizSessionQuestion[];
  teams: string[];
  open: boolean;
}

export interface QuizSessionPatch {
  openQuestionIds?: string[];
  teams?: string[];
  open?: boolean;
}

export interface QuizResponseInput {
  questionId: string;
  /** 모둠 이름이 아니라 순번. 이름은 교사가 바꿀 수 있다. */
  teamIndex: number;
  answer: string;
}

export interface QuizResponse extends QuizResponseInput {
  submittedAt: string;
}
```

- [ ] **Step 4: 순수 로직을 만든다**

Create `src/features/quiz/session/sessionCore.ts`:

```ts
import type { QuizRun, QuizSet } from '../../../shared/domain/types';
import { isCorrect } from '../quizCore';
import type {
  QuizResponse,
  QuizSessionMode,
  QuizSessionQuestion,
} from './types';

/**
 * 세션 순수 로직.
 *
 * 통신은 QuizSessionRelay가 맡고, 여기에는 계산만 둔다.
 * 그래야 Firebase 없이도 규칙을 전부 검증할 수 있다.
 */

/** 0·1·O·I·L처럼 헷갈리는 글자를 뺀 32자 (Crockford Base32) */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;

/**
 * 학생이 입력할 6자 코드.
 *
 * 32^6 ≈ 10억 가지라 찍어서 들어올 수 없다.
 * 겹치면 다시 만들되, 무한히 돌지 않도록 횟수를 제한한다.
 */
export function createSessionCode(
  isTaken: (code: string) => boolean,
  random: () => number = Math.random,
): string {
  let code = '';

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    code = '';
    for (let index = 0; index < CODE_LENGTH; index += 1) {
      const pick = Math.floor(random() * CODE_ALPHABET.length);
      code += CODE_ALPHABET[Math.min(Math.max(pick, 0), CODE_ALPHABET.length - 1)] ?? '0';
    }
    if (!isTaken(code)) return code;
  }

  // 다섯 번 다 겹쳤다. 마지막 것을 그대로 쓴다. 실제로는 일어나지 않는다.
  return code;
}

/**
 * 지금 답할 수 있는 문제.
 *
 * 두 모드의 유일한 차이다. 나머지 화면·집계는 전부 공유한다.
 */
export function openQuestionIdsFor(
  set: QuizSet,
  mode: QuizSessionMode,
  questionIndex: number,
): string[] {
  if (mode === 'student') return set.questions.map((question) => question.id);

  const question = set.questions[questionIndex];
  return question === undefined ? [] : [question.id];
}

/** 학생에게 보낼 문제. 정답과 해설을 뺀다. */
export function toSessionQuestions(set: QuizSet): QuizSessionQuestion[] {
  return set.questions.map((question) => ({
    id: question.id,
    type: question.type,
    text: question.text,
    choices: [...question.choices],
  }));
}

/**
 * 학생 응답으로 채점 결과를 갱신한다.
 *
 * 교사가 칠판에서 직접 누른 (문제, 모둠)은 건드리지 않는다.
 * 단답형은 기계 채점이 틀릴 수 있고, 그때 교사가 고친 것이
 * 조용히 되돌아가면 안 된다.
 */
export function mergeAutoGrading(
  run: QuizRun,
  set: QuizSet,
  responses: readonly QuizResponse[],
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...run.correctTeamsByQuestion };

  for (const question of set.questions) {
    const mine = responses.filter((row) => row.questionId === question.id);
    if (mine.length === 0) continue;

    const touched = new Set(run.manualTeamsByQuestion[question.id] ?? []);
    const current = new Set(next[question.id] ?? []);

    for (const row of mine) {
      const team = run.teams[row.teamIndex];
      if (team === undefined || touched.has(team)) continue;

      if (isCorrect(question, row.answer)) current.add(team);
      else current.delete(team);
    }

    next[question.id] = [...current];
  }

  return next;
}

/** 그 문제에 답한 모둠 수. 응답 하나가 곧 모둠 하나다. */
export function submittedTeamCount(
  responses: readonly QuizResponse[],
  questionId: string,
): number {
  return responses.filter((row) => row.questionId === questionId).length;
}
```

- [ ] **Step 5: `QuizRun`에 수기 표시 필드를 더한다**

`src/shared/domain/types.ts`의 `QuizRun`에서 `correctTeamsByQuestion` 아래에 추가:

```ts
  /**
   * 교사가 칠판에서 직접 정오를 누른 (문제 id → 모둠 이름[]).
   *
   * 자동 채점이 여기 있는 자리는 건드리지 않는다.
   * 한 번 누르면 껐다 켜도 영구히 교사 것이다.
   * "교사가 오답으로 되돌린 것"과 "아직 안 본 것"은 다르다.
   */
  manualTeamsByQuestion: Record<string, string[]>;
```

`src/shared/storage/schema.ts`의 `parseQuizRun`에서 `correctTeamsByQuestion` 줄 아래에 추가:

```ts
    manualTeamsByQuestion: parseStringArrayRecord(raw['manualTeamsByQuestion']),
```

`src/features/quiz/quizCore.ts`의 `createRunState` 반환값에 추가:

```ts
    manualTeamsByQuestion: {},
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npm run verify`
Expected: 타입 검사 0건, 기존 132개 + 새 15개 통과, 빌드 성공

타입 오류가 나면 `QuizRun`을 만드는 다른 자리(테스트 픽스처 포함)에 `manualTeamsByQuestion: {}`을 채운다.

- [ ] **Step 7: 커밋**

```bash
git add src/features/quiz/session src/shared/domain/types.ts src/shared/storage/schema.ts src/features/quiz/quizCore.ts tests/quiz/sessionCore.test.ts
git commit -m "feat(quiz): 학생 응답 세션의 타입과 순수 로직"
```

---

## Task 2: 이음매와 두 구현 (Memory · Local)

**Files:**
- Create: `src/features/quiz/session/QuizSessionRelay.ts`, `MemorySessionRelay.ts`, `LocalSessionRelay.ts`
- Test: `tests/quiz/sessionRelay.test.ts`

**Interfaces:**
- Consumes: Task 1의 `types.ts`
- Produces:
  - `interface QuizSessionRelay` — `isAvailable` · `open` · `update` · `close` · `sweepExpired` · `watchResponses` · `watchSession` · `submit`
  - `getSessionRelay(): QuizSessionRelay` / `setSessionRelay(relay: QuizSessionRelay): void`
  - `class MemorySessionRelay`, `class LocalSessionRelay`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `tests/quiz/sessionRelay.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalSessionRelay } from '../../src/features/quiz/session/LocalSessionRelay';
import { MemorySessionRelay } from '../../src/features/quiz/session/MemorySessionRelay';
import type { QuizSessionInit, QuizSessionRelay } from '../../src/features/quiz/session/QuizSessionRelay';

const NOW = '2026-08-14T09:00:00.000Z';
const LATER = '2026-08-14T12:00:00.000Z';

function init(overrides: Partial<QuizSessionInit> = {}): QuizSessionInit {
  return {
    ownerKey: 'owner-1',
    quizSetId: 'qs-1',
    title: '퀴즈',
    mode: 'teacher',
    openQuestionIds: ['q1'],
    questions: [{ id: 'q1', type: 'ox', text: '문제', choices: [] }],
    teams: ['1모둠', '2모둠'],
    expiresAt: LATER,
    ...overrides,
  };
}

/** 두 구현이 같은 계약을 지켜야 한다. 같은 테스트를 둘 다에 돌린다. */
function contractTests(name: string, make: () => QuizSessionRelay) {
  describe(name, () => {
    it('세션을 열면 6자 코드를 돌려준다', async () => {
      const { code } = await make().open(init());

      expect(code).toMatch(/^[0-9A-Z]{6}$/);
    });

    it('연 세션을 학생 쪽에서 볼 수 있다', async () => {
      const relay = make();
      const { code } = await relay.open(init());

      const seen = vi.fn();
      relay.watchSession(code, seen);
      await Promise.resolve();

      expect(seen).toHaveBeenCalled();
      expect(seen.mock.calls.at(-1)?.[0]).toMatchObject({ code, open: true, title: '퀴즈' });
    });

    it('제출한 답이 교사 쪽에 도착한다', async () => {
      const relay = make();
      const { code } = await relay.open(init());

      const seen = vi.fn();
      relay.watchResponses(code, seen);
      await relay.submit(code, { questionId: 'q1', teamIndex: 0, answer: 'O' });
      await Promise.resolve();

      expect(seen.mock.calls.at(-1)?.[0]).toEqual([
        expect.objectContaining({ questionId: 'q1', teamIndex: 0, answer: 'O' }),
      ]);
    });

    it('같은 모둠이 다시 내면 마지막 답만 남는다', async () => {
      const relay = make();
      const { code } = await relay.open(init());

      await relay.submit(code, { questionId: 'q1', teamIndex: 0, answer: 'O' });
      await relay.submit(code, { questionId: 'q1', teamIndex: 0, answer: 'X' });

      const seen = vi.fn();
      relay.watchResponses(code, seen);
      await Promise.resolve();

      const rows = seen.mock.calls.at(-1)?.[0] as Array<{ answer: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.answer).toBe('X');
    });

    it('닫힌 세션에는 제출할 수 없다', async () => {
      const relay = make();
      const { code } = await relay.open(init());
      await relay.update(code, { open: false });

      await expect(
        relay.submit(code, { questionId: 'q1', teamIndex: 0, answer: 'O' }),
      ).rejects.toThrow();
    });

    it('없는 코드를 보면 null이 온다', async () => {
      const relay = make();
      const seen = vi.fn();
      relay.watchSession('ZZZZZZ', seen);
      await Promise.resolve();

      expect(seen).toHaveBeenCalledWith(null);
    });

    it('세션을 지우면 학생 쪽에 null이 온다', async () => {
      const relay = make();
      const { code } = await relay.open(init());

      const seen = vi.fn();
      relay.watchSession(code, seen);
      await relay.close(code);
      await Promise.resolve();

      expect(seen.mock.calls.at(-1)?.[0]).toBeNull();
    });

    it('열린 문제를 바꾸면 학생 쪽이 따라온다', async () => {
      const relay = make();
      const { code } = await relay.open(init());

      const seen = vi.fn();
      relay.watchSession(code, seen);
      await relay.update(code, { openQuestionIds: ['q2'] });
      await Promise.resolve();

      expect(seen.mock.calls.at(-1)?.[0]).toMatchObject({ openQuestionIds: ['q2'] });
    });

    it('해제하면 더는 오지 않는다', async () => {
      const relay = make();
      const { code } = await relay.open(init());

      const seen = vi.fn();
      const stop = relay.watchResponses(code, seen);
      await Promise.resolve();
      const before = seen.mock.calls.length;

      stop();
      await relay.submit(code, { questionId: 'q1', teamIndex: 0, answer: 'O' });
      await Promise.resolve();

      expect(seen.mock.calls.length).toBe(before);
    });

    it('만료된 내 세션만 지운다', async () => {
      const relay = make();
      const mine = await relay.open(init({ expiresAt: '2020-01-01T00:00:00.000Z' }));
      const alive = await relay.open(init());
      const other = await relay.open(
        init({ ownerKey: 'owner-2', expiresAt: '2020-01-01T00:00:00.000Z' }),
      );

      await relay.sweepExpired('owner-1');

      const check = async (code: string) => {
        const seen = vi.fn();
        relay.watchSession(code, seen);
        await Promise.resolve();
        return seen.mock.calls.at(-1)?.[0];
      };

      expect(await check(mine.code)).toBeNull();
      expect(await check(alive.code)).not.toBeNull();
      expect(await check(other.code)).not.toBeNull();
    });
  });
}

contractTests('MemorySessionRelay', () => new MemorySessionRelay(() => NOW));

describe('LocalSessionRelay', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('학생 폰은 받을 수 없다고 알린다', () => {
    expect(new LocalSessionRelay(window.localStorage, () => NOW).isAvailable).toBe(false);
  });
});

contractTests('LocalSessionRelay', () => {
  window.localStorage.clear();
  return new LocalSessionRelay(window.localStorage, () => NOW);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/quiz/sessionRelay.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 인터페이스와 교체 지점을 만든다**

Create `src/features/quiz/session/QuizSessionRelay.ts`:

```ts
import { LocalSessionRelay } from './LocalSessionRelay';
import type {
  QuizResponse,
  QuizResponseInput,
  QuizSessionInit,
  QuizSessionPatch,
  QuizSessionView,
} from './types';

export type {
  QuizResponse,
  QuizResponseInput,
  QuizSessionInit,
  QuizSessionPatch,
  QuizSessionView,
} from './types';

/**
 * 학생 응답 통로.
 *
 * StorageAdapter와 나란한 두 번째 이음매다.
 * 이것이 있는 이유는 Firebase를 붙일 때 화면 코드를 고치지 않기 위해서다.
 *
 * 설계 근거: docs/superpowers/specs/2026-08-14-quiz-live-responses-design.md §3
 */
export interface QuizSessionRelay {
  /** 학생 폰이 들어올 수 있는가. false면 화면이 안내로 바뀐다. */
  readonly isAvailable: boolean;

  open(init: QuizSessionInit): Promise<{ code: string }>;
  update(code: string, patch: QuizSessionPatch): Promise<void>;
  close(code: string): Promise<void>;
  /** 만료된 내 세션을 지운다. Cloud Functions를 못 쓰므로 청소는 여기서 한다. */
  sweepExpired(ownerKey: string): Promise<void>;

  /** 교사 화면용. 해제 함수를 돌려준다. */
  watchResponses(code: string, listener: (rows: QuizResponse[]) => void): () => void;
  /** 학생 화면용. 세션이 없어졌으면 null. */
  watchSession(code: string, listener: (view: QuizSessionView | null) => void): () => void;
  submit(code: string, input: QuizResponseInput): Promise<void>;
}

/*
 * 교체 지점.
 *
 * Firebase를 붙일 때 AI 스튜디오 에이전트가 고칠 곳은 여기 한 곳이다.
 * ToolkitDataProvider처럼 props로 주입하지 않는 이유는 학생 화면(/join)이
 * 그 공급자 바깥에 있기 때문이다.
 */
let current: QuizSessionRelay | null = null;

export function getSessionRelay(): QuizSessionRelay {
  current ??= new LocalSessionRelay();
  return current;
}

export function setSessionRelay(relay: QuizSessionRelay): void {
  current = relay;
}
```

- [ ] **Step 4: MemorySessionRelay를 만든다**

Create `src/features/quiz/session/MemorySessionRelay.ts`:

```ts
import type { QuizSessionRelay } from './QuizSessionRelay';
import { createSessionCode } from './sessionCore';
import type {
  QuizResponse,
  QuizResponseInput,
  QuizSessionInit,
  QuizSessionPatch,
  QuizSessionView,
} from './types';

interface Entry {
  init: QuizSessionInit;
  open: boolean;
  /** `${questionId}__t${teamIndex}` → 응답 */
  responses: Map<string, QuizResponse>;
}

/** 테스트용. 프로세스 메모리에만 산다. */
export class MemorySessionRelay implements QuizSessionRelay {
  readonly isAvailable = true;

  private readonly entries = new Map<string, Entry>();
  private readonly sessionListeners = new Map<string, Set<(view: QuizSessionView | null) => void>>();
  private readonly responseListeners = new Map<string, Set<(rows: QuizResponse[]) => void>>();

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  async open(init: QuizSessionInit): Promise<{ code: string }> {
    const code = createSessionCode((candidate) => this.entries.has(candidate));
    this.entries.set(code, { init, open: true, responses: new Map() });
    this.notify(code);
    return { code };
  }

  async update(code: string, patch: QuizSessionPatch): Promise<void> {
    const entry = this.entries.get(code);
    if (entry === undefined) return;

    if (patch.openQuestionIds !== undefined) entry.init.openQuestionIds = patch.openQuestionIds;
    if (patch.teams !== undefined) entry.init.teams = patch.teams;
    if (patch.open !== undefined) entry.open = patch.open;
    this.notify(code);
  }

  async close(code: string): Promise<void> {
    this.entries.delete(code);
    this.notify(code);
  }

  async sweepExpired(ownerKey: string): Promise<void> {
    const now = this.clock();
    for (const [code, entry] of [...this.entries]) {
      if (entry.init.ownerKey === ownerKey && entry.init.expiresAt <= now) {
        this.entries.delete(code);
        this.notify(code);
      }
    }
  }

  watchSession(code: string, listener: (view: QuizSessionView | null) => void): () => void {
    return this.subscribe(this.sessionListeners, code, listener, () => this.viewOf(code));
  }

  watchResponses(code: string, listener: (rows: QuizResponse[]) => void): () => void {
    return this.subscribe(this.responseListeners, code, listener, () => this.rowsOf(code));
  }

  async submit(code: string, input: QuizResponseInput): Promise<void> {
    const entry = this.entries.get(code);
    if (entry === undefined || !entry.open) {
      throw new Error('받기가 끝난 세션입니다.');
    }

    // 문서 id가 (문제, 모둠)이므로 마지막 제출이 그대로 덮어쓴다.
    entry.responses.set(`${input.questionId}__t${input.teamIndex}`, {
      ...input,
      submittedAt: this.clock(),
    });
    this.notify(code);
  }

  private subscribe<T>(
    registry: Map<string, Set<(value: T) => void>>,
    code: string,
    listener: (value: T) => void,
    read: () => T,
  ): () => void {
    const set = registry.get(code) ?? new Set();
    set.add(listener);
    registry.set(code, set);

    listener(read());

    return () => {
      set.delete(listener);
    };
  }

  private viewOf(code: string): QuizSessionView | null {
    const entry = this.entries.get(code);
    if (entry === undefined) return null;

    return {
      code,
      title: entry.init.title,
      mode: entry.init.mode,
      openQuestionIds: [...entry.init.openQuestionIds],
      questions: entry.init.questions,
      teams: [...entry.init.teams],
      open: entry.open,
    };
  }

  private rowsOf(code: string): QuizResponse[] {
    return [...(this.entries.get(code)?.responses.values() ?? [])];
  }

  private notify(code: string): void {
    for (const listener of this.sessionListeners.get(code) ?? []) listener(this.viewOf(code));
    for (const listener of this.responseListeners.get(code) ?? []) listener(this.rowsOf(code));
  }
}
```

- [ ] **Step 5: LocalSessionRelay를 만든다**

Create `src/features/quiz/session/LocalSessionRelay.ts`:

```ts
import type { QuizSessionRelay } from './QuizSessionRelay';
import { createSessionCode } from './sessionCore';
import type {
  QuizResponse,
  QuizResponseInput,
  QuizSessionInit,
  QuizSessionPatch,
  QuizSessionView,
} from './types';

/**
 * 기본 구현. 같은 브라우저의 다른 탭까지만 닿는다.
 *
 * 학생 폰은 받을 수 없다(isAvailable = false). 그래도 흐름 전체가 동작하므로
 * Firebase 없이 검증하고 연수에서 시연할 수 있다.
 *
 * 창 사이 전달은 storage 이벤트를 쓴다. 창 간 동기화에서 이미 검증한 방식이다.
 * storage 이벤트는 자기 탭에서는 오지 않으므로 자기 탭 리스너는 직접 부른다.
 */

const STORAGE_KEY = 'teacher-toolkit:v1:quiz-sessions';

interface Stored {
  init: QuizSessionInit;
  open: boolean;
  /** `${questionId}__t${teamIndex}` → 응답 */
  responses: Record<string, QuizResponse>;
}

type Book = Record<string, Stored>;

export class LocalSessionRelay implements QuizSessionRelay {
  /** 같은 브라우저 안에서만 오간다. 학생 폰은 들어올 수 없다. */
  readonly isAvailable = false;

  private readonly sessionListeners = new Map<string, Set<(view: QuizSessionView | null) => void>>();
  private readonly responseListeners = new Map<string, Set<(rows: QuizResponse[]) => void>>();
  private stopStorage: (() => void) | null = null;

  constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async open(init: QuizSessionInit): Promise<{ code: string }> {
    const book = this.read();
    const code = createSessionCode((candidate) => candidate in book);
    book[code] = { init, open: true, responses: {} };
    this.write(book);
    return { code };
  }

  async update(code: string, patch: QuizSessionPatch): Promise<void> {
    const book = this.read();
    const entry = book[code];
    if (entry === undefined) return;

    if (patch.openQuestionIds !== undefined) entry.init.openQuestionIds = patch.openQuestionIds;
    if (patch.teams !== undefined) entry.init.teams = patch.teams;
    if (patch.open !== undefined) entry.open = patch.open;
    this.write(book);
  }

  async close(code: string): Promise<void> {
    const book = this.read();
    delete book[code];
    this.write(book);
  }

  async sweepExpired(ownerKey: string): Promise<void> {
    const book = this.read();
    const now = this.clock();
    let changed = false;

    for (const [code, entry] of Object.entries(book)) {
      if (entry.init.ownerKey === ownerKey && entry.init.expiresAt <= now) {
        delete book[code];
        changed = true;
      }
    }
    if (changed) this.write(book);
  }

  watchSession(code: string, listener: (view: QuizSessionView | null) => void): () => void {
    return this.subscribe(this.sessionListeners, code, listener, () => this.viewOf(code));
  }

  watchResponses(code: string, listener: (rows: QuizResponse[]) => void): () => void {
    return this.subscribe(this.responseListeners, code, listener, () => this.rowsOf(code));
  }

  async submit(code: string, input: QuizResponseInput): Promise<void> {
    const book = this.read();
    const entry = book[code];
    if (entry === undefined || !entry.open) {
      throw new Error('받기가 끝난 세션입니다.');
    }

    entry.responses[`${input.questionId}__t${input.teamIndex}`] = {
      ...input,
      submittedAt: this.clock(),
    };
    this.write(book);
  }

  // ── 내부 ──────────────────────────────────────────────────

  private read(): Book {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw === null || raw === '') return {};
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Book)
        : {};
    } catch {
      // 깨져 있으면 세션이 없는 것으로 본다. 임시 자료라 잃어도 된다.
      return {};
    }
  }

  private write(book: Book): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(book));
    } catch {
      // 저장이 막혀도 앱이 멈추면 안 된다.
    }
    this.notifyAll();
  }

  private subscribe<T>(
    registry: Map<string, Set<(value: T) => void>>,
    code: string,
    listener: (value: T) => void,
    read: () => T,
  ): () => void {
    const set = registry.get(code) ?? new Set();
    set.add(listener);
    registry.set(code, set);
    this.ensureStorageListener();

    listener(read());

    return () => {
      set.delete(listener);
      if (set.size === 0) registry.delete(code);
      this.releaseStorageListener();
    };
  }

  private ensureStorageListener(): void {
    if (this.stopStorage !== null || typeof window === 'undefined') return;

    const handle = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY) return;
      this.notifyAll();
    };
    window.addEventListener('storage', handle);
    this.stopStorage = () => window.removeEventListener('storage', handle);
  }

  private releaseStorageListener(): void {
    if (this.sessionListeners.size > 0 || this.responseListeners.size > 0) return;
    this.stopStorage?.();
    this.stopStorage = null;
  }

  private viewOf(code: string): QuizSessionView | null {
    const entry = this.read()[code];
    if (entry === undefined) return null;

    return {
      code,
      title: entry.init.title,
      mode: entry.init.mode,
      openQuestionIds: [...entry.init.openQuestionIds],
      questions: entry.init.questions,
      teams: [...entry.init.teams],
      open: entry.open,
    };
  }

  private rowsOf(code: string): QuizResponse[] {
    return Object.values(this.read()[code]?.responses ?? {});
  }

  private notifyAll(): void {
    for (const [code, listeners] of this.sessionListeners) {
      const view = this.viewOf(code);
      for (const listener of listeners) listener(view);
    }
    for (const [code, listeners] of this.responseListeners) {
      const rows = this.rowsOf(code);
      for (const listener of listeners) listener(rows);
    }
  }
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npm run verify`
Expected: 전부 통과 (계약 테스트 10개 × 2구현 + Local 전용 1개)

- [ ] **Step 7: 커밋**

```bash
git add src/features/quiz/session tests/quiz/sessionRelay.test.ts
git commit -m "feat(quiz): 세션 통로 인터페이스와 Memory·Local 구현"
```

---

## Task 3: 교사 훅 — 세션 수명과 자동 채점 연결

**Files:**
- Create: `src/features/quiz/session/useQuizSession.ts`
- Modify: `src/features/quiz/useQuiz.ts`
- Test: `tests/quiz/useQuizSession.test.tsx`

**Interfaces:**
- Consumes: Task 1 `sessionCore`, Task 2 `QuizSessionRelay`
- Produces:
  - `useQuizSession(): QuizSessionState` — `{ isAvailable, code, session, responses, start, stop, syncOpenQuestions }`
  - `useQuiz()`에 `applyAutoGrading: (responses: readonly QuizResponse[]) => void` 추가

- [ ] **Step 1: `markCorrect`가 수기 표시를 남기게 고친다**

`src/features/quiz/useQuiz.ts`의 `markCorrect` 안, `return { ...current, ... }` 부분을 바꾼다:

```ts
      const manual = current.manualTeamsByQuestion[questionId] ?? [];

      return {
        ...current,
        correctTeamsByQuestion: { ...current.correctTeamsByQuestion, [questionId]: next },
        // 한 번 누르면 그 자리는 영구히 교사 것이다. 자동 채점이 건드리지 않는다.
        manualTeamsByQuestion: {
          ...current.manualTeamsByQuestion,
          [questionId]: manual.includes(team) ? manual : [...manual, team],
        },
      };
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

Create `tests/quiz/useQuizSession.test.tsx`:

```tsx
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MemorySessionRelay } from '../../src/features/quiz/session/MemorySessionRelay';
import { setSessionRelay } from '../../src/features/quiz/session/QuizSessionRelay';
import { useQuizSession } from '../../src/features/quiz/session/useQuizSession';
import { createQuestion, createQuizSet } from '../../src/shared/domain/factories';
import type { QuizSet } from '../../src/shared/domain/types';

const NOW = '2026-08-14T09:00:00.000Z';

const set: QuizSet = createQuizSet(
  {
    id: 'qs-1',
    title: '퀴즈',
    questions: [
      createQuestion({ id: 'q1', type: 'ox', text: '문제1', answer: 'O' }),
      createQuestion({ id: 'q2', type: 'ox', text: '문제2', answer: 'X' }),
    ],
  },
  NOW,
);

function renderHook() {
  const seen: { current: ReturnType<typeof useQuizSession> | null } = { current: null };

  function Probe() {
    seen.current = useQuizSession();
    return null;
  }

  render(<Probe />);
  return seen;
}

describe('useQuizSession', () => {
  it('세션을 열면 코드와 세션 상태를 들고 있다', async () => {
    setSessionRelay(new MemorySessionRelay(() => NOW));
    const seen = renderHook();

    await act(async () => {
      await seen.current?.start({ set, mode: 'teacher', questionIndex: 0, teams: ['1모둠'] });
    });

    await waitFor(() => expect(seen.current?.code).not.toBeNull());
    expect(seen.current?.session?.openQuestionIds).toEqual(['q1']);
  });

  it('세션 문제에 정답이 들어가지 않는다', async () => {
    setSessionRelay(new MemorySessionRelay(() => NOW));
    const seen = renderHook();

    await act(async () => {
      await seen.current?.start({ set, mode: 'student', questionIndex: 0, teams: ['1모둠'] });
    });

    await waitFor(() => expect(seen.current?.session).not.toBeNull());
    expect(JSON.stringify(seen.current?.session?.questions)).not.toContain('answer');
  });

  it('제출한 답이 responses로 들어온다', async () => {
    const relay = new MemorySessionRelay(() => NOW);
    setSessionRelay(relay);
    const seen = renderHook();

    await act(async () => {
      await seen.current?.start({ set, mode: 'teacher', questionIndex: 0, teams: ['1모둠'] });
    });
    const code = seen.current?.code ?? '';

    await act(async () => {
      await relay.submit(code, { questionId: 'q1', teamIndex: 0, answer: 'O' });
    });

    await waitFor(() => expect(seen.current?.responses).toHaveLength(1));
  });

  it('문제를 넘기면 열린 문제가 따라간다', async () => {
    setSessionRelay(new MemorySessionRelay(() => NOW));
    const seen = renderHook();

    await act(async () => {
      await seen.current?.start({ set, mode: 'teacher', questionIndex: 0, teams: ['1모둠'] });
    });

    await act(async () => {
      await seen.current?.syncOpenQuestions(set, 1);
    });

    await waitFor(() => expect(seen.current?.session?.openQuestionIds).toEqual(['q2']));
  });

  it('세션을 닫으면 코드가 사라진다', async () => {
    setSessionRelay(new MemorySessionRelay(() => NOW));
    const seen = renderHook();

    await act(async () => {
      await seen.current?.start({ set, mode: 'teacher', questionIndex: 0, teams: ['1모둠'] });
    });
    await act(async () => {
      await seen.current?.stop();
    });

    expect(seen.current?.code).toBeNull();
    expect(seen.current?.responses).toEqual([]);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/quiz/useQuizSession.test.tsx`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 4: 훅을 만든다**

Create `src/features/quiz/session/useQuizSession.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import type { QuizSet } from '../../../shared/domain/types';
import { getSessionRelay } from './QuizSessionRelay';
import { openQuestionIdsFor, toSessionQuestions } from './sessionCore';
import type { QuizResponse, QuizSessionMode, QuizSessionView } from './types';

/**
 * 교사 쪽 세션 상태.
 *
 * 세션 코드는 이 훅 안에만 산다. ToolkitData에 넣지 않는다.
 * 새로고침하면 세션이 끊기지만, 임시 통로라 그래도 된다.
 */

/** 세 시간. 수업 한 차시를 훨씬 넘고, 잊고 닫아도 오래 남지 않는다. */
const SESSION_HOURS = 3;

export interface StartOptions {
  set: QuizSet;
  mode: QuizSessionMode;
  questionIndex: number;
  teams: string[];
}

export interface QuizSessionState {
  isAvailable: boolean;
  code: string | null;
  session: QuizSessionView | null;
  responses: QuizResponse[];
  start: (options: StartOptions) => Promise<void>;
  stop: () => Promise<void>;
  /** 교사가 문제를 넘기면 부른다. 학생 주도 모드에서는 아무 일도 하지 않는다. */
  syncOpenQuestions: (set: QuizSet, questionIndex: number) => Promise<void>;
}

/** 이 브라우저를 가리키는 고정 id. 만료 청소가 남의 세션을 지우지 않게 한다. */
function ownerKey(): string {
  const key = 'teacher-toolkit:v1:session-owner';
  try {
    const saved = window.localStorage.getItem(key);
    if (saved !== null && saved !== '') return saved;
    const made = `owner-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(key, made);
    return made;
  } catch {
    return 'owner-local';
  }
}

export function useQuizSession(): QuizSessionState {
  const relay = getSessionRelay();

  const [code, setCode] = useState<string | null>(null);
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const modeRef = useRef<QuizSessionMode>('teacher');

  // 앱을 열 때 만료된 내 세션을 지운다. Cloud Functions를 못 쓴다.
  useEffect(() => {
    void relay.sweepExpired(ownerKey());
  }, [relay]);

  useEffect(() => {
    if (code === null) return;

    const stopSession = relay.watchSession(code, setSession);
    const stopResponses = relay.watchResponses(code, setResponses);
    return () => {
      stopSession();
      stopResponses();
    };
  }, [relay, code]);

  const start = useCallback(
    async ({ set, mode, questionIndex, teams }: StartOptions): Promise<void> => {
      modeRef.current = mode;

      const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
      const { code: made } = await relay.open({
        ownerKey: ownerKey(),
        quizSetId: set.id,
        title: set.title,
        mode,
        openQuestionIds: openQuestionIdsFor(set, mode, questionIndex),
        questions: toSessionQuestions(set),
        teams,
        expiresAt,
      });

      setCode(made);
    },
    [relay],
  );

  const stop = useCallback(async (): Promise<void> => {
    if (code !== null) await relay.close(code);
    setCode(null);
    setSession(null);
    setResponses([]);
  }, [relay, code]);

  const syncOpenQuestions = useCallback(
    async (set: QuizSet, questionIndex: number): Promise<void> => {
      if (code === null || modeRef.current === 'student') return;
      await relay.update(code, { openQuestionIds: openQuestionIdsFor(set, 'teacher', questionIndex) });
    },
    [relay, code],
  );

  return {
    isAvailable: relay.isAvailable,
    code,
    session,
    responses,
    start,
    stop,
    syncOpenQuestions,
  };
}
```

- [ ] **Step 5: 자동 채점을 적용하는 자리를 만든다**

`mergeAutoGrading`을 정의만 하고 부르지 않으면 자동 채점이 저장소에 닿지 않는다.
`useQuiz.ts`에 적용 함수를 더한다. 임포트에 추가:

```ts
import { mergeAutoGrading } from './session/sessionCore';
import type { QuizResponse } from './session/types';
```

`QuizView` 인터페이스에 추가:

```ts
  /** 학생 응답으로 채점을 갱신한다. 교사가 손댄 자리는 건드리지 않는다. */
  applyAutoGrading: (responses: readonly QuizResponse[]) => void;
```

`deleteResult` 옆에 구현을 추가:

```ts
  const applyAutoGrading = useCallback(
    (responses: readonly QuizResponse[]): void => {
      update((current) => {
        if (current.quizRun === null) return current;

        const set = current.quizSets.find((item) => item.id === current.quizRun?.quizSetId);
        if (set === undefined) return current;

        const next = mergeAutoGrading(current.quizRun, set, responses);

        /*
         * 값이 그대로면 저장하지 않는다.
         * 다른 창도 같은 계산을 하므로, 매번 쓰면 서로 알림을 주고받으며 돈다.
         */
        if (JSON.stringify(next) === JSON.stringify(current.quizRun.correctTeamsByQuestion)) {
          return current;
        }

        return { ...current, quizRun: { ...current.quizRun, correctTeamsByQuestion: next } };
      });
    },
    [update],
  );
```

반환 객체에 `applyAutoGrading`을 넣는다.

- [ ] **Step 6: 적용 테스트를 더한다**

`tests/quiz/useQuizSession.test.tsx` 끝에 추가하지 말고, `tests/quiz/sessionCore.test.ts`가
이미 병합 규칙을 덮으므로 여기서는 **연결만** 확인한다.
`tests/quiz/applyAutoGrading.test.tsx`를 새로 만든다:

```tsx
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useQuiz } from '../../src/features/quiz/useQuiz';
import { createQuestion, createQuizSet } from '../../src/shared/domain/factories';
import { createEmptyToolkitData } from '../../src/shared/domain/factories';
import type { ToolkitData } from '../../src/shared/domain/types';
import { ToolkitDataProvider } from '../../src/shared/state/ToolkitDataProvider';
import { ToastProvider } from '../../src/shared/ui';
import { stubAdapter } from '../helpers/stubAdapter';

const NOW = '2026-08-14T09:00:00.000Z';

const set = createQuizSet(
  { id: 'qs-1', title: '퀴즈', questions: [createQuestion({ id: 'q1', type: 'ox', text: '문제', answer: 'O' })] },
  NOW,
);

function seeded(): ToolkitData {
  return {
    ...createEmptyToolkitData(),
    quizSets: [set],
    quizRun: {
      quizSetId: 'qs-1',
      questionIndex: 0,
      correctTeamsByQuestion: {},
      manualTeamsByQuestion: {},
      revealed: false,
      teams: ['1모둠', '2모둠'],
      startedAt: NOW,
    },
  };
}

function renderQuiz() {
  const seen: { current: ReturnType<typeof useQuiz> | null } = { current: null };

  function Probe() {
    seen.current = useQuiz();
    return null;
  }

  render(
    <ToastProvider>
      <ToolkitDataProvider
        adapter={stubAdapter({
          load: async () => ({ data: seeded(), repairs: [], isFirstRun: false }),
        })}
      >
        <Probe />
      </ToolkitDataProvider>
    </ToastProvider>,
  );

  return seen;
}

describe('useQuiz.applyAutoGrading', () => {
  it('학생 응답이 채점 결과로 들어간다', async () => {
    const seen = renderQuiz();
    await waitFor(() => expect(seen.current?.run).not.toBeNull());

    act(() =>
      seen.current?.applyAutoGrading([
        { questionId: 'q1', teamIndex: 0, answer: 'O', submittedAt: NOW },
      ]),
    );

    expect(seen.current?.run?.correctTeamsByQuestion['q1']).toEqual(['1모둠']);
  });

  it('교사가 손댄 자리는 그대로 둔다', async () => {
    const seen = renderQuiz();
    await waitFor(() => expect(seen.current?.run).not.toBeNull());

    // 교사가 1모둠을 눌렀다가 다시 눌러 해제했다
    act(() => seen.current?.markCorrect('1모둠'));
    act(() => seen.current?.markCorrect('1모둠'));

    act(() =>
      seen.current?.applyAutoGrading([
        { questionId: 'q1', teamIndex: 0, answer: 'O', submittedAt: NOW },
      ]),
    );

    expect(seen.current?.run?.correctTeamsByQuestion['q1'] ?? []).toEqual([]);
  });
});
```

- [ ] **Step 7: 통과를 확인한다**

Run: `npm run verify`
Expected: 전부 통과

- [ ] **Step 8: 커밋**

```bash
git add src/features/quiz/session/useQuizSession.ts src/features/quiz/useQuiz.ts tests/quiz/useQuizSession.test.tsx tests/quiz/applyAutoGrading.test.tsx
git commit -m "feat(quiz): 교사 쪽 세션 훅과 자동 채점 적용"
```

---

## Task 4: 학생 화면 `/join/:code`

**Files:**
- Create: `src/features/quiz/JoinPage.tsx`
- Modify: `src/app/router.tsx`
- Test: `tests/quiz/JoinPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 `getSessionRelay`, `setSessionRelay`, Task 1 `types`
- Produces: 기본 내보내기 `JoinPage`, 라우트 `/join/:code`

- [ ] **Step 0: 테스트 의존성을 설치한다**

학생 화면은 버튼을 눌러야 검증되므로 `user-event`가 필요하다. 아직 없다.

```bash
npm install --save-dev @testing-library/user-event
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `tests/quiz/JoinPage.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import JoinPage from '../../src/features/quiz/JoinPage';
import { MemorySessionRelay } from '../../src/features/quiz/session/MemorySessionRelay';
import { setSessionRelay } from '../../src/features/quiz/session/QuizSessionRelay';
import type { QuizSessionInit } from '../../src/features/quiz/session/types';
import { ToastProvider } from '../../src/shared/ui';

const NOW = '2026-08-14T09:00:00.000Z';

function init(overrides: Partial<QuizSessionInit> = {}): QuizSessionInit {
  return {
    ownerKey: 'owner-1',
    quizSetId: 'qs-1',
    title: '수학 형성평가',
    mode: 'teacher',
    openQuestionIds: ['q1'],
    questions: [
      { id: 'q1', type: 'ox', text: '지구는 둥글다', choices: [] },
      { id: 'q2', type: 'choice', text: '가장 큰 수는?', choices: ['1', '2'] },
    ],
    teams: ['1모둠', '2모둠'],
    expiresAt: '2026-08-14T12:00:00.000Z',
    ...overrides,
  };
}

function renderAt(code: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/join/${code}`]}>
        <Routes>
          <Route path="join/:code" element={<JoinPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('JoinPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('없는 코드면 안내를 보여 준다', async () => {
    setSessionRelay(new MemorySessionRelay(() => NOW));
    renderAt('ZZZZZZ');

    expect(await screen.findByText(/받기가 끝났습니다|찾지 못했습니다/)).toBeInTheDocument();
  });

  it('모둠을 먼저 고르게 한다', async () => {
    const relay = new MemorySessionRelay(() => NOW);
    setSessionRelay(relay);
    const { code } = await relay.open(init());

    renderAt(code);

    expect(await screen.findByRole('button', { name: '1모둠' })).toBeInTheDocument();
    expect(screen.queryByText('지구는 둥글다')).not.toBeInTheDocument();
  });

  it('모둠을 고르면 열린 문제만 보여 준다', async () => {
    const relay = new MemorySessionRelay(() => NOW);
    setSessionRelay(relay);
    const { code } = await relay.open(init());

    renderAt(code);
    await userEvent.click(await screen.findByRole('button', { name: '1모둠' }));

    expect(await screen.findByText('지구는 둥글다')).toBeInTheDocument();
    expect(screen.queryByText('가장 큰 수는?')).not.toBeInTheDocument();
  });

  it('학생 주도면 전체 문제를 보여 준다', async () => {
    const relay = new MemorySessionRelay(() => NOW);
    setSessionRelay(relay);
    const { code } = await relay.open(init({ mode: 'student', openQuestionIds: ['q1', 'q2'] }));

    renderAt(code);
    await userEvent.click(await screen.findByRole('button', { name: '1모둠' }));

    expect(await screen.findByText('지구는 둥글다')).toBeInTheDocument();
    expect(await screen.findByText('가장 큰 수는?')).toBeInTheDocument();
  });

  it('OX 답을 내면 교사 쪽에 도착한다', async () => {
    const relay = new MemorySessionRelay(() => NOW);
    setSessionRelay(relay);
    const { code } = await relay.open(init());

    renderAt(code);
    await userEvent.click(await screen.findByRole('button', { name: '1모둠' }));
    await userEvent.click(await screen.findByRole('button', { name: 'O' }));

    await waitFor(() => {
      const seen: unknown[] = [];
      relay.watchResponses(code, (rows) => seen.push(rows));
      expect(seen.at(-1)).toEqual([
        expect.objectContaining({ questionId: 'q1', teamIndex: 0, answer: 'O' }),
      ]);
    });
  });

  it('세션이 닫히면 화면이 바뀐다', async () => {
    const relay = new MemorySessionRelay(() => NOW);
    setSessionRelay(relay);
    const { code } = await relay.open(init());

    renderAt(code);
    await userEvent.click(await screen.findByRole('button', { name: '1모둠' }));
    await screen.findByText('지구는 둥글다');

    await act(async () => {
      await relay.close(code);
    });

    expect(await screen.findByText(/받기가 끝났습니다/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/quiz/JoinPage.test.tsx`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 학생 화면을 만든다**

Create `src/features/quiz/JoinPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button, EmptyState, useToast } from '../../shared/ui';
import { getSessionRelay } from './session/QuizSessionRelay';
import type { QuizSessionQuestion, QuizSessionView } from './session/types';

/**
 * 학생 화면.
 *
 * AppShell 밖에 둔다. 학생 폰에는 교사용 내비게이션이 필요 없다.
 * 폰 화면(360px)을 기준으로 짠다.
 */

function teamStorageKey(code: string): string {
  return `teacher-toolkit:v1:join-team:${code}`;
}

export default function JoinPage() {
  const { code = '' } = useParams();
  const relay = getSessionRelay();
  const toast = useToast();

  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [checked, setChecked] = useState(false);
  const [teamIndex, setTeamIndex] = useState<number | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});

  useEffect(() => {
    if (code === '') return;

    const stop = relay.watchSession(code, (view) => {
      setSession(view);
      setChecked(true);
    });
    return stop;
  }, [relay, code]);

  // 새로고침해도 모둠을 다시 고르지 않게 한다.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(teamStorageKey(code));
      if (saved !== null) setTeamIndex(Number.parseInt(saved, 10));
    } catch {
      // 저장이 막혀 있으면 매번 고르면 된다.
    }
  }, [code]);

  const chooseTeam = useCallback(
    (index: number): void => {
      setTeamIndex(index);
      try {
        window.localStorage.setItem(teamStorageKey(code), String(index));
      } catch {
        // 무시한다
      }
    },
    [code],
  );

  const submit = useCallback(
    (question: QuizSessionQuestion, answer: string): void => {
      if (teamIndex === null) return;

      void (async () => {
        try {
          await relay.submit(code, { questionId: question.id, teamIndex, answer });
          setSent((current) => ({ ...current, [question.id]: answer }));
          toast.success('제출했습니다.');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : '제출하지 못했습니다.');
        }
      })();
    },
    [relay, code, teamIndex, toast],
  );

  const openQuestions = useMemo(() => {
    if (session === null) return [];
    return session.questions.filter((question) => session.openQuestionIds.includes(question.id));
  }, [session]);

  if (!checked) return null;

  if (session === null || !session.open) {
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState
          title="받기가 끝났습니다"
          description="선생님이 응답 받기를 마쳤거나 주소가 올바르지 않습니다."
        />
      </div>
    );
  }

  if (teamIndex === null) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <header>
          <h1 className="text-xl font-bold text-slate-900">{session.title}</h1>
          <p className="mt-1 text-sm text-slate-600">우리 모둠을 골라 주세요.</p>
        </header>
        <div className="grid gap-2">
          {session.teams.map((team, index) => (
            <Button key={team} variant="secondary" onClick={() => chooseTeam(index)}>
              {team}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold text-slate-900">{session.title}</h1>
        <span className="text-sm text-slate-500">{session.teams[teamIndex] ?? ''}</span>
      </header>

      {openQuestions.length === 0 ? (
        <EmptyState title="잠시 기다려 주세요" description="선생님이 다음 문제를 준비하고 있습니다." />
      ) : (
        openQuestions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            sent={sent[question.id]}
            onSubmit={(answer) => submit(question, answer)}
          />
        ))
      )}
    </div>
  );
}

function QuestionCard(props: {
  question: QuizSessionQuestion;
  sent: string | undefined;
  onSubmit: (answer: string) => void;
}) {
  const { question, sent, onSubmit } = props;
  const [draft, setDraft] = useState('');

  return (
    <section className="rounded-card border border-slate-200 bg-white p-4">
      <p className="text-base font-medium text-slate-900">{question.text}</p>

      {question.type === 'ox' ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {['O', 'X'].map((value) => (
            <Button
              key={value}
              variant={sent === value ? 'primary' : 'secondary'}
              onClick={() => onSubmit(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      ) : question.type === 'choice' ? (
        <div className="mt-3 grid gap-2">
          {question.choices.map((choice, index) => (
            <Button
              key={`${choice}-${index}`}
              variant={sent === String(index) ? 'primary' : 'secondary'}
              onClick={() => onSubmit(String(index))}
            >
              {index + 1}. {choice}
            </Button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="답을 적어 주세요"
            className="h-11 min-w-0 flex-1 rounded-control border border-slate-300 px-3"
          />
          <Button variant="primary" onClick={() => onSubmit(draft)}>
            제출
          </Button>
        </div>
      )}

      {sent === undefined ? null : (
        <p className="mt-2 text-sm text-success-700">제출했습니다. 다시 내면 바뀝니다.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 라우트를 더한다**

`src/app/router.tsx`에서 `BoardPage` 아래에 lazy 추가:

```tsx
const JoinPage = lazy(() => import('../features/quiz/JoinPage'));
```

`board/:feature` 라우트 객체 **뒤에** 형제로 추가:

```tsx
  {
    // 학생 화면. 셸 밖에 둔다. 폰에는 교사용 내비게이션이 필요 없다.
    path: 'join/:code',
    element: (
      <Suspense fallback={<PageLoader />}>
        <JoinPage />
      </Suspense>
    ),
    errorElement: <RootErrorBoundary />,
  },
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npm run verify`
Expected: 전부 통과

`@testing-library/user-event`가 없다는 오류가 나면 설치한다:

```bash
npm install --save-dev @testing-library/user-event
```

- [ ] **Step 6: 커밋**

```bash
git add src/features/quiz/JoinPage.tsx src/app/router.tsx tests/quiz/JoinPage.test.tsx package.json package-lock.json
git commit -m "feat(quiz): 학생 응답 화면 /join/:code"
```

---

## Task 5: 교사 화면과 칠판

**Files:**
- Create: `src/features/quiz/QuizSessionPanel.tsx`
- Modify: `src/features/quiz/QuizPage.tsx`, `src/features/quiz/QuizBoard.tsx`
- Test: `tests/quiz/QuizSessionPanel.test.tsx`

**Interfaces:**
- Consumes: Task 3 `useQuizSession`, Task 1 `submittedTeamCount`
- Produces: `QuizSessionPanel` — 기본 내보내기 아님, 이름 붙은 내보내기

- [ ] **Step 1: `qrcode`를 설치한다**

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

Create `tests/quiz/QuizSessionPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { QuizSessionPanel } from '../../src/features/quiz/QuizSessionPanel';
import { MemorySessionRelay } from '../../src/features/quiz/session/MemorySessionRelay';
import { setSessionRelay } from '../../src/features/quiz/session/QuizSessionRelay';
import { createQuestion, createQuizSet } from '../../src/shared/domain/factories';
import { ToastProvider } from '../../src/shared/ui';

const NOW = '2026-08-14T09:00:00.000Z';

const set = createQuizSet(
  { id: 'qs-1', title: '퀴즈', questions: [createQuestion({ id: 'q1', type: 'ox', text: '문제', answer: 'O' })] },
  NOW,
);

function renderPanel() {
  return render(
    <ToastProvider>
      <QuizSessionPanel set={set} questionIndex={0} teams={['1모둠', '2모둠']} />
    </ToastProvider>,
  );
}

describe('QuizSessionPanel', () => {
  it('세션을 열면 코드를 보여 준다', async () => {
    setSessionRelay(new MemorySessionRelay(() => NOW));
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /학생 응답 받기/ }));
    await userEvent.click(await screen.findByRole('button', { name: /수업 중 함께 풀기/ }));

    expect(await screen.findByTestId('session-code')).toHaveTextContent(/^[0-9A-Z]{6}$/);
  });

  it('제출 현황을 보여 준다', async () => {
    const relay = new MemorySessionRelay(() => NOW);
    setSessionRelay(relay);
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /학생 응답 받기/ }));
    await userEvent.click(await screen.findByRole('button', { name: /수업 중 함께 풀기/ }));

    const code = (await screen.findByTestId('session-code')).textContent ?? '';
    await relay.submit(code, { questionId: 'q1', teamIndex: 0, answer: 'O' });

    expect(await screen.findByText('1 / 2 모둠 제출')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/quiz/QuizSessionPanel.test.tsx`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 4: 패널을 만든다**

Create `src/features/quiz/QuizSessionPanel.tsx`:

```tsx
import { QrCode, Square, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

import type { QuizSet } from '../../shared/domain/types';
import { Badge, Button, Card, useToast } from '../../shared/ui';
import { submittedTeamCount } from './session/sessionCore';
import type { QuizResponse } from './session/types';
import { useQuizSession } from './session/useQuizSession';

/**
 * 학생 응답 받기 패널.
 *
 * Firebase가 없으면 QR을 보여 주지 않는다. 학생 폰이 들어올 수 없기 때문이다.
 * 대신 같은 브라우저에서 시험해 볼 수 있게 학생 화면 주소를 준다.
 */
export function QuizSessionPanel(props: {
  set: QuizSet;
  questionIndex: number;
  teams: string[];
  /** 응답이 바뀌면 부른다. QuizPage가 자동 채점을 붙인다. */
  onResponses?: (rows: QuizResponse[]) => void;
}) {
  const { set, questionIndex, teams, onResponses } = props;
  const session = useQuizSession();
  const toast = useToast();

  /*
   * 자동 채점을 여기서 부르지 않고 위로 올린다.
   * 이 컴포넌트가 ToolkitData를 몰라야 공급자 없이 테스트할 수 있다.
   */
  useEffect(() => {
    onResponses?.(session.responses);
  }, [session.responses, onResponses]);

  const [choosing, setChoosing] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const joinUrl =
    session.code === null ? '' : `${window.location.origin}/join/${session.code}`;

  useEffect(() => {
    if (session.code === null || !session.isAvailable) {
      setQr(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(joinUrl, { width: 240, margin: 1 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [session.code, session.isAvailable, joinUrl]);

  // 교사가 문제를 넘기면 학생 화면도 따라간다.
  useEffect(() => {
    void session.syncOpenQuestions(set, questionIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex, set.id]);

  if (session.code === null) {
    return (
      <Card title="학생 응답" icon={Users}>
        {choosing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                void session.start({ set, mode: 'teacher', questionIndex, teams }).then(() => {
                  setChoosing(false);
                });
              }}
            >
              수업 중 함께 풀기
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void session.start({ set, mode: 'student', questionIndex, teams }).then(() => {
                  setChoosing(false);
                });
              }}
            >
              모둠별로 각자 풀기
            </Button>
            <Button variant="ghost" onClick={() => setChoosing(false)}>
              취소
            </Button>
          </div>
        ) : (
          <Button variant="primary" icon={QrCode} onClick={() => setChoosing(true)}>
            학생 응답 받기
          </Button>
        )}
      </Card>
    );
  }

  const question = set.questions[questionIndex];
  const submitted = question === undefined ? 0 : submittedTeamCount(session.responses, question.id);

  return (
    <Card
      title="학생 응답 받는 중"
      icon={Users}
      action={
        <Button size="sm" variant="ghost" icon={Square} onClick={() => void session.stop()}>
          받기 종료
        </Button>
      }
    >
      <div className="flex flex-wrap items-start gap-4">
        {qr === null ? null : <img src={qr} alt="학생 접속 QR" className="size-40 shrink-0" />}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-slate-600">학생에게 이 코드를 알려 주세요.</p>
          <p
            data-testid="session-code"
            className="font-mono text-3xl font-bold tracking-widest text-slate-900"
          >
            {session.code}
          </p>

          <Badge tone={submitted > 0 ? 'success' : 'neutral'}>
            {submitted} / {teams.length} 모둠 제출
          </Badge>

          {session.isAvailable ? (
            <p className="truncate text-sm text-slate-500">{joinUrl}</p>
          ) : (
            <div className="flex flex-col gap-1 text-sm text-warning-700">
              <p>Firebase를 붙이기 전에는 학생 폰이 들어올 수 없습니다.</p>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                onClick={() => {
                  window.open(joinUrl, '_blank', 'noopener');
                  toast.info('이 브라우저의 새 탭에서 학생 화면을 열었습니다.');
                }}
              >
                이 브라우저에서 시험해 보기
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: `QuizPage`에 패널을 붙인다**

`src/features/quiz/QuizPage.tsx`에서 임포트 추가:

```tsx
import { QuizSessionPanel } from './QuizSessionPanel';
```

진행 중일 때(`quiz.run !== null && quiz.runningSet !== null`) 보이도록, 상단 버튼 줄 아래에 넣는다:

```tsx
      {quiz.run !== null && quiz.runningSet !== null ? (
        <QuizSessionPanel
          set={quiz.runningSet}
          questionIndex={quiz.run.questionIndex}
          teams={quiz.teams}
          onResponses={quiz.applyAutoGrading}
        />
      ) : null}
```

`applyAutoGrading`은 `useQuiz`가 `useCallback`으로 만든 안정된 참조라
`QuizSessionPanel`의 효과가 매 렌더 다시 돌지 않는다.

- [ ] **Step 6: 칠판에 제출 현황을 더한다**

`src/features/quiz/QuizBoard.tsx`에서 모둠 버튼을 그리는 부분에 제출 점을 더한다.
`useQuizSession`을 불러 `responses`를 받고, 모둠별 제출 여부만 표시한다.

임포트:

```tsx
import { useQuizSession } from './session/useQuizSession';
```

컴포넌트 안 맨 위:

```tsx
  const live = useQuizSession();
```

모둠 버튼 안, 팀 이름 앞에 표시를 넣는다:

```tsx
                {live.responses.some(
                  (row) => row.questionId === question.id && quiz.teams[row.teamIndex] === team,
                ) ? (
                  // 정답 공개 전에는 냈다는 것만 보인다. 답을 보여 주면 베낀다.
                  <span aria-label="제출함" className="mr-2 inline-block size-2 rounded-full bg-success-500" />
                ) : null}
```

- [ ] **Step 7: 통과를 확인한다**

Run: `npm run verify`
Expected: 전부 통과

- [ ] **Step 8: 브라우저에서 흐름을 확인한다**

`npm run dev` → 문제 세트를 만들고 `퀴즈 시작` → `학생 응답 받기` → `수업 중 함께 풀기`
→ `이 브라우저에서 시험해 보기`로 학생 탭을 열고 모둠을 골라 답 제출
→ 교사 화면 제출 현황과 칠판 점이 갱신되는지 본다.

- [ ] **Step 9: 커밋**

```bash
git add src/features/quiz tests/quiz package.json package-lock.json
git commit -m "feat(quiz): 교사 응답 패널과 칠판 제출 표시"
```

---

## Task 6: Firebase 안내 갱신

**Files:**
- Modify: `docs/firebase-guide.md`

- [ ] **Step 1: 3단계 지시문에 항목을 더한다**

`docs/firebase-guide.md`의 3단계 지시문 목록 끝(11번 앞)에 넣는다:

```markdown
> 11. `src/features/quiz/session/FirestoreSessionRelay.ts`를 만들어. `src/features/quiz/session/QuizSessionRelay.ts`의 인터페이스를 그대로 구현하고, `isAvailable`은 `true`로 둬. 세션은 `quizSessions/{code}` 문서에, 응답은 그 아래 `responses/{questionId}__t{teamIndex}` 문서에 저장해. 문서 id가 (문제, 모둠)이라 마지막 제출이 그대로 덮어써야 해.
> 12. `src/main.tsx`에서 Firebase 설정이 채워져 있으면 `setSessionRelay(new FirestoreSessionRelay(...))`를 부르도록 해. 설정이 없으면 지금처럼 `LocalSessionRelay`가 쓰이게 둬.
> 13. 학생은 로그인하지 않으므로 `signInAnonymously`로 익명 인증을 해. Firebase 콘솔에서 익명 로그인을 켜야 해.
> 14. **세션 문서에 정답을 넣지 마.** 학생이 그 문서를 그대로 읽어. `QuizSessionQuestion`에는 정답과 해설이 없어야 해.
```

기존 11번(`npm run verify`)은 15번으로 번호를 옮긴다.

- [ ] **Step 2: 4단계 보안 규칙에 세션 규칙을 더한다**

`docs/firebase-guide.md` 4단계의 규칙 블록에서 `match /teachers/...` 아래에 넣는다:

```
    // 학생 응답 수집 세션. 학생은 익명 로그인으로 들어온다.
    match /quizSessions/{code} {
      allow read: if resource.data.open == true;
      allow create: if request.auth.uid == request.resource.data.ownerUid;
      allow update, delete: if request.auth.uid == resource.data.ownerUid;

      match /responses/{responseId} {
        // 세션이 열려 있어야 쓸 수 있다. 로그인만 확인하고 끝내지 않는다.
        allow create, update: if request.auth != null
          && get(/databases/$(database)/documents/quizSessions/$(code)).data.open == true;
        // 학생은 남의 답을 읽지 못한다.
        allow read: if request.auth.uid ==
          get(/databases/$(database)/documents/quizSessions/$(code)).data.ownerUid;
      }
    }
```

- [ ] **Step 3: 1단계에 익명 로그인 안내를 더한다**

1단계 5번 아래에 넣는다:

```markdown
6. 같은 화면에서 **익명** 로그인도 사용 설정하세요. 학생이 QR로 들어올 때 씁니다.
```

- [ ] **Step 4: 확인 체크리스트에 항목을 더한다**

"잘 됐는지 확인하기" 목록에 넣는다:

```markdown
- [ ] 형성평가에서 `학생 응답 받기`를 누르면 QR이 나오고, 다른 기기에서 그 QR로 들어가진다
- [ ] 학생이 낸 답이 교사 화면 제출 현황에 바로 반영된다
```

- [ ] **Step 5: 커밋**

```bash
git add docs/firebase-guide.md
git commit -m "docs: FirestoreSessionRelay와 세션 보안 규칙 안내"
```

---

## 완료 확인

- [ ] `npm run verify` 통과
- [ ] 브라우저에서 교사 탭 + 학생 탭 흐름 확인
- [ ] 칠판에서 정답 공개 전 정오가 보이지 않음
- [ ] push
