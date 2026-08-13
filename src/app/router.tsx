import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';
import { PageLoader } from './PageLoader';
import { RootErrorBoundary } from './RootErrorBoundary';

/* 도구별 lazy 분할. 수업 중 한 도구만 열었을 때 나머지를 내려받지 않는다. */
const HomePage = lazy(() => import('../features/home/HomePage'));
const LessonPage = lazy(() => import('../features/lesson/LessonPage'));
const QuizPage = lazy(() => import('../features/quiz/QuizPage'));
const TaskPage = lazy(() => import('../features/task/TaskPage'));
const MessagePage = lazy(() => import('../features/message/MessagePage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const BoardPage = lazy(() => import('../features/board/BoardPage'));

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RootErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'lesson', element: <LessonPage /> },
      { path: 'quiz', element: <QuizPage /> },
      { path: 'task', element: <TaskPage /> },
      { path: 'message', element: <MessagePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    // 전자칠판은 셸 밖에 둔다. 별도 창·보조 모니터에 URL로 바로 띄운다.
    path: 'board/:feature',
    element: (
      <Suspense fallback={<PageLoader />}>
        <BoardPage />
      </Suspense>
    ),
    errorElement: <RootErrorBoundary />,
  },
]);
