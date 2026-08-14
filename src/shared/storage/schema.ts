import { createEmptyToolkitData } from '../domain/factories';
import {
  CURRENT_SCHEMA_VERSION,
  MESSAGE_CATEGORIES,
  TASK_AREAS,
  type ActivityMode,
  type LessonPhase,
  type LessonRun,
  type LessonStage,
  type LessonTemplate,
  type MessageTemplate,
  type QuestionType,
  type QuizQuestion,
  type QuizResult,
  type QuizRun,
  type QuizSet,
  type TaskItem,
  type TaskPriority,
  type TaskStep,
  type ToolkitData,
} from '../domain/types';

/**
 * 저장된 원시 데이터를 ToolkitData로 해석한다.
 *
 * 전제는 1단계와 같다. **저장소의 내용은 신뢰할 수 없다.**
 * 흰 화면 대신 최대한 살려서 열고, 살리지 못한 항목은 개수를 세어 보고한다.
 */

export interface RepairLog {
  message: string;
  severity: 'info' | 'warning';
}

export interface ParseResult {
  data: ToolkitData;
  repairs: RepairLog[];
}

// ── 원시값 헬퍼 ────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function requiredStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const PHASES: readonly LessonPhase[] = ['intro', 'activity', 'wrapup'];
const MODES: readonly ActivityMode[] = ['individual', 'pair', 'group', 'whole'];
const QUESTION_TYPES: readonly QuestionType[] = ['choice', 'ox', 'short'];
const PRIORITIES: readonly TaskPriority[] = ['high', 'normal', 'low'];

// ── 엔티티 해석 ────────────────────────────────────────────────

function parseStage(raw: unknown): LessonStage | null {
  if (!isRecord(raw)) return null;
  const id = requiredStr(raw['id']);
  if (id === null) return null;

  return {
    id,
    phase: oneOf(raw['phase'], PHASES, 'activity'),
    title: str(raw['title'], '이름 없는 단계'),
    guide: str(raw['guide']),
    // 음수 분은 타이머를 즉시 끝내 버린다.
    minutes: Math.max(0, Math.round(num(raw['minutes'], 0))),
    mode: oneOf(raw['mode'], MODES, 'whole'),
  };
}

function parseLessonTemplate(raw: unknown, now: string): LessonTemplate | null {
  if (!isRecord(raw)) return null;
  const id = requiredStr(raw['id']);
  if (id === null) return null;

  return {
    id,
    title: str(raw['title'], '이름 없는 수업'),
    subject: str(raw['subject']),
    stages: asArray(raw['stages']).flatMap((s) => {
      const stage = parseStage(s);
      return stage === null ? [] : [stage];
    }),
    createdAt: str(raw['createdAt'], now),
    updatedAt: str(raw['updatedAt'], now),
  };
}

function parseLessonRun(raw: unknown, templates: readonly LessonTemplate[]): LessonRun | null {
  if (!isRecord(raw)) return null;
  const templateId = requiredStr(raw['templateId']);
  if (templateId === null) return null;

  // 없어진 수업을 가리키면 진행 상태를 버린다. 그대로 두면 빈 화면이 뜬다.
  const template = templates.find((item) => item.id === templateId);
  if (template === undefined) return null;

  const stageIndex = Math.round(num(raw['stageIndex'], 0));

  return {
    templateId,
    stageIndex: Math.max(0, Math.min(stageIndex, Math.max(0, template.stages.length - 1))),
    doneStageIds: strArray(raw['doneStageIds']),
    startedAt: str(raw['startedAt']),
  };
}

function parseQuestion(raw: unknown): QuizQuestion | null {
  if (!isRecord(raw)) return null;
  const id = requiredStr(raw['id']);
  if (id === null) return null;

  const type = oneOf(raw['type'], QUESTION_TYPES, 'choice');

  return {
    id,
    type,
    text: str(raw['text']),
    choices: strArray(raw['choices']),
    answer: str(raw['answer']),
    explanation: str(raw['explanation']),
    timeLimitSec: Math.max(0, Math.round(num(raw['timeLimitSec'], 0))),
    // 0점짜리 문제는 점수판을 이상하게 만든다.
    points: Math.max(1, Math.round(num(raw['points'], 1))),
  };
}

function parseQuizSet(raw: unknown, now: string): QuizSet | null {
  if (!isRecord(raw)) return null;
  const id = requiredStr(raw['id']);
  if (id === null) return null;

  return {
    id,
    title: str(raw['title'], '이름 없는 문제 세트'),
    subject: str(raw['subject']),
    questions: asArray(raw['questions']).flatMap((q) => {
      const question = parseQuestion(q);
      return question === null ? [] : [question];
    }),
    createdAt: str(raw['createdAt'], now),
    updatedAt: str(raw['updatedAt'], now),
  };
}

function parseNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};

  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = raw;
  }
  return result;
}

function parseQuizResult(raw: unknown, now: string): QuizResult | null {
  if (!isRecord(raw)) return null;
  const id = requiredStr(raw['id']);
  const quizSetId = requiredStr(raw['quizSetId']);
  if (id === null || quizSetId === null) return null;

  return {
    id,
    quizSetId,
    teamScores: parseNumberRecord(raw['teamScores']),
    correctByQuestion: parseNumberRecord(raw['correctByQuestion']),
    totalTeams: Math.max(0, Math.round(num(raw['totalTeams'], 0))),
    playedAt: str(raw['playedAt'], now),
  };
}

function parseStringArrayRecord(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};

  const result: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) result[key] = strArray(raw);
  return result;
}

function parseQuizRun(raw: unknown, sets: readonly QuizSet[]): QuizRun | null {
  if (!isRecord(raw)) return null;
  const quizSetId = requiredStr(raw['quizSetId']);
  if (quizSetId === null) return null;

  // 없어진 문제 세트를 가리키면 진행 상태를 버린다. 그대로 두면 빈 화면이 뜬다.
  const set = sets.find((item) => item.id === quizSetId);
  if (set === undefined) return null;

  const index = Math.round(num(raw['questionIndex'], 0));

  return {
    quizSetId,
    questionIndex: Math.max(0, Math.min(index, Math.max(0, set.questions.length - 1))),
    correctTeamsByQuestion: parseStringArrayRecord(raw['correctTeamsByQuestion']),
    manualTeamsByQuestion: parseStringArrayRecord(raw['manualTeamsByQuestion']),
    sessionCode: requiredStr(raw['sessionCode']),
    revealed: bool(raw['revealed'], false),
    teams: strArray(raw['teams']),
    startedAt: str(raw['startedAt']),
  };
}

function parseStep(raw: unknown): TaskStep | null {
  if (!isRecord(raw)) return null;
  const id = requiredStr(raw['id']);
  if (id === null) return null;

  return { id, text: str(raw['text']), done: bool(raw['done'], false) };
}

function parseTask(raw: unknown, now: string): TaskItem | null {
  if (!isRecord(raw)) return null;
  const id = requiredStr(raw['id']);
  if (id === null) return null;

  return {
    id,
    title: str(raw['title'], '이름 없는 업무'),
    area: oneOf(raw['area'], TASK_AREAS, '기타'),
    dueDate: str(raw['dueDate']),
    priority: oneOf(raw['priority'], PRIORITIES, 'normal'),
    steps: asArray(raw['steps']).flatMap((s) => {
      const step = parseStep(s);
      return step === null ? [] : [step];
    }),
    memo: str(raw['memo']),
    done: bool(raw['done'], false),
    createdAt: str(raw['createdAt'], now),
    updatedAt: str(raw['updatedAt'], now),
  };
}

function parseMessageTemplate(raw: unknown, now: string): MessageTemplate | null {
  if (!isRecord(raw)) return null;
  const id = requiredStr(raw['id']);
  if (id === null) return null;

  return {
    id,
    category: oneOf(raw['category'], MESSAGE_CATEGORIES, '기타'),
    title: str(raw['title'], '이름 없는 문구'),
    body: str(raw['body']),
    isBuiltIn: bool(raw['isBuiltIn'], false),
    createdAt: str(raw['createdAt'], now),
  };
}

// ── 진입점 ────────────────────────────────────────────────────

export function parseToolkitData(raw: unknown, now: string = new Date().toISOString()): ParseResult {
  const repairs: RepairLog[] = [];

  if (!isRecord(raw)) {
    return {
      data: createEmptyToolkitData(),
      repairs: [
        { severity: 'warning', message: '저장된 자료의 형식을 알아볼 수 없어 빈 상태로 시작합니다.' },
      ],
    };
  }

  const root: Record<string, unknown> = raw;

  const version = num(root['schemaVersion'], CURRENT_SCHEMA_VERSION);
  if (version > CURRENT_SCHEMA_VERSION) {
    repairs.push({
      severity: 'warning',
      message: `이 앱보다 새로운 버전(v${version})에서 저장한 자료입니다. 일부 정보가 빠질 수 있으니 앱을 최신으로 업데이트한 뒤 다시 열어 주세요.`,
    });
  }

  function parseList<T>(key: string, label: string, fn: (raw: unknown) => T | null): T[] {
    const parsed = asArray(root[key]).map(fn);
    const dropped = parsed.filter((v) => v === null).length;

    if (dropped > 0) {
      repairs.push({
        severity: 'warning',
        message: `${label} ${dropped}건이 손상되어 있어 불러오지 못했습니다.`,
      });
    }
    return parsed.filter((v): v is T => v !== null);
  }

  const profileRaw = isRecord(root['profile']) ? root['profile'] : {};
  const lessonTemplates = parseList('lessonTemplates', '수업 흐름', (r) => parseLessonTemplate(r, now));
  const quizSets = parseList('quizSets', '문제 세트', (r) => parseQuizSet(r, now));

  return {
    data: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      profile: {
        schoolName: str(profileRaw['schoolName']),
        teacherName: str(profileRaw['teacherName']),
        grade: str(profileRaw['grade']),
        classNo: str(profileRaw['classNo']),
      },
      lessonTemplates,
      lessonRun: parseLessonRun(root['lessonRun'], lessonTemplates),
      quizSets,
      quizResults: parseList('quizResults', '퀴즈 결과', (r) => parseQuizResult(r, now)),
      quizRun: parseQuizRun(root['quizRun'], quizSets),
      tasks: parseList('tasks', '업무', (r) => parseTask(r, now)),
      messageTemplates: parseList('messageTemplates', '문구 템플릿', (r) =>
        parseMessageTemplate(r, now),
      ),
      messageFavorites: strArray(root['messageFavorites']),
      messageHidden: strArray(root['messageHidden']),
    },
    repairs,
  };
}

export function serializeToolkitData(data: ToolkitData): string {
  return JSON.stringify({ ...data, schemaVersion: CURRENT_SCHEMA_VERSION }, null, 2);
}
