/**
 * 수업·업무 도구함의 데이터 모델.
 *
 * 1단계 G-classroom-suite와 달리 학생 명단이 없다.
 * 네 도구가 공유하는 것은 학교·교사 정보뿐이고, 서로 자료를 주고받지 않는다.
 * 억지로 엮지 않는 것이 이 저장소의 설계 방침이다.
 */

export const CURRENT_SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────
// 학교 프로필 — 문구 템플릿의 자동 치환에 쓰인다
// ─────────────────────────────────────────────────────────────

export interface SchoolProfile {
  schoolName: string;
  teacherName: string;
  /** "3" 처럼 숫자만. 치환 문구에 그대로 들어간다. */
  grade: string;
  /** "2" 처럼 숫자만 */
  classNo: string;
}

// ─────────────────────────────────────────────────────────────
// 수업 진행판 (features/lesson)
// ─────────────────────────────────────────────────────────────

export type LessonPhase = 'intro' | 'activity' | 'wrapup';
export type ActivityMode = 'individual' | 'pair' | 'group' | 'whole';

export interface LessonStage {
  id: string;
  phase: LessonPhase;
  title: string;
  /** 학생에게 보여 줄 안내 문구 */
  guide: string;
  /** 이 단계에 배정한 분. 0이면 타이머를 쓰지 않는다. */
  minutes: number;
  mode: ActivityMode;
}

export interface LessonTemplate {
  id: string;
  title: string;
  subject: string;
  stages: LessonStage[];
  createdAt: string;
  updatedAt: string;
}

/** 지금 진행 중인 수업. 새로고침해도 이어지도록 저장한다. */
export interface LessonRun {
  templateId: string;
  /** 현재 단계 인덱스 */
  stageIndex: number;
  /** 완료 표시한 단계 id */
  doneStageIds: string[];
  startedAt: string;
}

// ─────────────────────────────────────────────────────────────
// 형성평가·퀴즈 (features/quiz)
// ─────────────────────────────────────────────────────────────

export type QuestionType = 'choice' | 'ox' | 'short';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  text: string;
  /** 객관식 보기. OX·단답형에서는 비어 있다. */
  choices: string[];
  /**
   * 정답.
   * - choice: 정답 보기의 인덱스를 문자열로
   * - ox: 'O' 또는 'X'
   * - short: 인정하는 답 (여러 개면 쉼표로 나눠 저장)
   */
  answer: string;
  explanation: string;
  /** 이 문제의 제한 시간(초). 0이면 제한 없음. */
  timeLimitSec: number;
  points: number;
}

export interface QuizSet {
  id: string;
  title: string;
  subject: string;
  questions: QuizQuestion[];
  createdAt: string;
  updatedAt: string;
}

/** 한 번 진행한 결과. 문항별 정답 여부를 남겨 분석에 쓴다. */
export interface QuizResult {
  id: string;
  quizSetId: string;
  /** 팀 이름 → 점수. 개인이 아니라 팀 단위로 진행하는 것이 기본이다. */
  teamScores: Record<string, number>;
  /** 문제 id → 맞힌 팀 수 */
  correctByQuestion: Record<string, number>;
  totalTeams: number;
  playedAt: string;
}

/**
 * 진행 중인 퀴즈.
 *
 * 전자칠판은 새 창으로 열린다. 화면 안 state로 두면 칠판에서 아무것도 보이지 않는다.
 * 수업 중 퀴즈는 칠판이 주 화면이므로 진행 상태를 저장한다.
 */
export interface QuizRun {
  quizSetId: string;
  questionIndex: number;
  /** 문제 id → 맞힌 팀 이름 */
  correctTeamsByQuestion: Record<string, string[]>;
  /**
   * 교사가 칠판에서 직접 정오를 누른 (문제 id → 모둠 이름[]).
   *
   * 학생 응답 자동 채점이 여기 있는 자리는 건드리지 않는다.
   * 한 번 누르면 껐다 켜도 영구히 교사 것이다.
   * "교사가 오답으로 되돌린 것"과 "아직 안 본 것"은 다르다.
   */
  manualTeamsByQuestion: Record<string, string[]>;
  /**
   * 열려 있는 학생 응답 세션의 6자 코드. 없으면 null.
   *
   * 세션 자료 자체는 여기 두지 않지만 **가리키는 코드는 둔다.**
   * 전자칠판이 별도 창이라, 이것이 없으면 칠판은 세션을 찾을 길이 없다.
   */
  sessionCode: string | null;
  /** 정답을 공개했는지 */
  revealed: boolean;
  teams: string[];
  startedAt: string;
}

// ─────────────────────────────────────────────────────────────
// 업무 체크리스트 (features/task)
// ─────────────────────────────────────────────────────────────

export const TASK_AREAS = [
  '학기 초',
  '평가',
  '체험학습',
  '학부모 상담',
  '생활기록부',
  '학교 행사',
  '방학',
  '기타',
] as const;
export type TaskArea = (typeof TASK_AREAS)[number];

export type TaskPriority = 'high' | 'normal' | 'low';

export interface TaskStep {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  area: TaskArea;
  /** YYYY-MM-DD. 없으면 빈 문자열 */
  dueDate: string;
  priority: TaskPriority;
  steps: TaskStep[];
  /** 회의 안건·전달 사항 메모 */
  memo: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// 문구 템플릿 (features/message)
// ─────────────────────────────────────────────────────────────

export const MESSAGE_CATEGORIES = [
  '학부모 문자',
  '준비물 안내',
  '결석·미제출',
  '상담 안내',
  '행사 안내',
  '교직원 공지',
  '감사 인사',
  '기타',
] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export type MessageTone = 'plain' | 'polite' | 'formal';
export type MessageLength = 'short' | 'normal' | 'detailed';

export interface MessageTemplate {
  id: string;
  category: MessageCategory;
  title: string;
  /** {학교} {학년} {반} {교사} {날짜} {장소} 를 치환한다 */
  body: string;
  /** 기본 제공 문구인지. 기본 문구는 지울 수 없고 숨기기만 한다. */
  isBuiltIn: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────

export interface ToolkitData {
  schemaVersion: number;
  profile: SchoolProfile;

  lessonTemplates: LessonTemplate[];
  lessonRun: LessonRun | null;

  quizSets: QuizSet[];
  quizResults: QuizResult[];
  quizRun: QuizRun | null;

  tasks: TaskItem[];

  messageTemplates: MessageTemplate[];
  /** 즐겨찾기한 템플릿 id */
  messageFavorites: string[];
  /** 숨긴 기본 템플릿 id */
  messageHidden: string[];
}
