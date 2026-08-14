import type { LucideIcon } from 'lucide-react';
import { CheckSquare, Home, ListChecks, MessageSquareText, Presentation } from 'lucide-react';

/** 도구 식별자. 라우트·색상 토큰·전자칠판 라우트가 이 값을 공유한다. */
export type FeatureId = 'home' | 'lesson' | 'quiz' | 'task' | 'message';

export interface FeatureNavItem {
  id: FeatureId;
  path: string;
  label: string;
  /** 전자칠판 화면을 지원하는가. 업무·문구는 교사 혼자 보는 것이라 없다. */
  hasBoardView: boolean;
  icon: LucideIcon;
  accentClass: string;
  tintClass: string;
}

export const FEATURE_NAV: readonly FeatureNavItem[] = [
  {
    id: 'home',
    path: '/',
    label: '홈',
    hasBoardView: false,
    icon: Home,
    accentClass: 'text-brand-600',
    tintClass: 'bg-brand-50',
  },
  {
    id: 'lesson',
    path: '/lesson',
    label: '수업 진행',
    hasBoardView: true,
    icon: Presentation,
    accentClass: 'text-lesson-500',
    tintClass: 'bg-lesson-50',
  },
  {
    id: 'quiz',
    path: '/quiz',
    label: '형성평가',
    hasBoardView: true,
    icon: CheckSquare,
    accentClass: 'text-quiz-500',
    tintClass: 'bg-quiz-50',
  },
  {
    id: 'task',
    path: '/task',
    label: '업무 체크',
    hasBoardView: false,
    icon: ListChecks,
    accentClass: 'text-task-500',
    tintClass: 'bg-task-50',
  },
  {
    id: 'message',
    path: '/message',
    label: '문구 템플릿',
    hasBoardView: false,
    icon: MessageSquareText,
    accentClass: 'text-message-500',
    tintClass: 'bg-message-50',
  },
] as const;

export function findFeature(id: string): FeatureNavItem | undefined {
  return FEATURE_NAV.find((item) => item.id === id);
}
