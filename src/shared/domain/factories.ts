import { createId } from '../ids';
import {
  CURRENT_SCHEMA_VERSION,
  type LessonStage,
  type LessonTemplate,
  type MessageTemplate,
  type QuizQuestion,
  type QuizSet,
  type TaskItem,
  type ToolkitData,
} from './types';

/**
 * 엔티티 생성 헬퍼.
 *
 * 모든 생성 함수는 `now`를 주입받는다. 테스트에서 시각을 고정하기 위해서다.
 * 원본 앱들은 `new Date().toISOString()`을 곳곳에서 직접 불러 테스트할 수 없었다.
 */

function nowIso(): string {
  return new Date().toISOString();
}

export { createId };

// ── 수업 진행판 ────────────────────────────────────────────────

export function createStage(
  input: Pick<LessonStage, 'phase' | 'title'> & Partial<Omit<LessonStage, 'phase' | 'title'>>,
): LessonStage {
  return {
    id: input.id ?? createId(),
    phase: input.phase,
    title: input.title,
    guide: input.guide ?? '',
    minutes: input.minutes ?? 0,
    mode: input.mode ?? 'whole',
  };
}

export function createLessonTemplate(
  input: Pick<LessonTemplate, 'title'> & Partial<Pick<LessonTemplate, 'id' | 'subject' | 'stages'>>,
  now: string = nowIso(),
): LessonTemplate {
  return {
    id: input.id ?? createId(),
    title: input.title,
    subject: input.subject ?? '',
    stages: input.stages ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 처음 만들 때 제안하는 수업 흐름.
 *
 * 빈 화면에서 단계를 처음부터 짜게 하면 수업 직전에 쓸 수 없다.
 * 도입·활동·정리 뼈대를 깔아 주고 교사가 고치게 한다.
 */
export function starterLessonStages(): LessonStage[] {
  return [
    createStage({ phase: 'intro', title: '동기 유발', guide: '오늘 배울 내용을 함께 살펴봅니다', minutes: 5, mode: 'whole' }),
    createStage({ phase: 'intro', title: '학습 목표 확인', guide: '', minutes: 3, mode: 'whole' }),
    createStage({ phase: 'activity', title: '활동 1', guide: '', minutes: 12, mode: 'individual' }),
    createStage({ phase: 'activity', title: '활동 2', guide: '', minutes: 12, mode: 'group' }),
    createStage({ phase: 'wrapup', title: '정리·발표', guide: '', minutes: 6, mode: 'whole' }),
    createStage({ phase: 'wrapup', title: '차시 예고', guide: '', minutes: 2, mode: 'whole' }),
  ];
}

// ── 퀴즈 ──────────────────────────────────────────────────────

export function createQuestion(
  input: Pick<QuizQuestion, 'type' | 'text'> & Partial<Omit<QuizQuestion, 'type' | 'text'>>,
): QuizQuestion {
  return {
    id: input.id ?? createId(),
    type: input.type,
    text: input.text,
    choices: input.choices ?? (input.type === 'choice' ? ['', '', '', ''] : []),
    answer: input.answer ?? (input.type === 'ox' ? 'O' : input.type === 'choice' ? '0' : ''),
    explanation: input.explanation ?? '',
    timeLimitSec: input.timeLimitSec ?? 0,
    points: input.points ?? 1,
  };
}

export function createQuizSet(
  input: Pick<QuizSet, 'title'> & Partial<Pick<QuizSet, 'id' | 'subject' | 'questions'>>,
  now: string = nowIso(),
): QuizSet {
  return {
    id: input.id ?? createId(),
    title: input.title,
    subject: input.subject ?? '',
    questions: input.questions ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── 업무 ──────────────────────────────────────────────────────

export function createTask(
  input: Pick<TaskItem, 'title'> &
    Partial<Pick<TaskItem, 'id' | 'area' | 'dueDate' | 'priority' | 'steps' | 'memo'>>,
  now: string = nowIso(),
): TaskItem {
  return {
    id: input.id ?? createId(),
    title: input.title,
    area: input.area ?? '기타',
    dueDate: input.dueDate ?? '',
    priority: input.priority ?? 'normal',
    steps: input.steps ?? [],
    memo: input.memo ?? '',
    done: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ── 문구 템플릿 ────────────────────────────────────────────────

export function createMessageTemplate(
  input: Pick<MessageTemplate, 'category' | 'title' | 'body'> &
    Partial<Pick<MessageTemplate, 'id' | 'isBuiltIn'>>,
  now: string = nowIso(),
): MessageTemplate {
  return {
    id: input.id ?? createId(),
    category: input.category,
    title: input.title,
    body: input.body,
    isBuiltIn: input.isBuiltIn ?? false,
    createdAt: now,
  };
}

// ── 빈 데이터 ─────────────────────────────────────────────────

export function createEmptyToolkitData(): ToolkitData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: { schoolName: '', teacherName: '', grade: '', classNo: '' },
    lessonTemplates: [],
    lessonRun: null,
    quizSets: [],
    quizResults: [],
    quizRun: null,
    tasks: [],
    messageTemplates: [],
    messageFavorites: [],
    messageHidden: [],
  };
}
