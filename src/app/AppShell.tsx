import { Settings } from 'lucide-react';
import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { useToolkit } from '../shared/state/ToolkitDataProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { FEATURE_NAV } from './navigation';
import { PageLoader } from './PageLoader';

/** 공통 레이아웃. 1단계와 달리 학급 전환이 없어 헤더가 단순하다. */
export function AppShell() {
  const { data } = useToolkit();
  const { schoolName, grade, classNo } = data.profile;
  const context = [schoolName, grade === '' ? '' : `${grade}학년`, classNo === '' ? '' : `${classNo}반`]
    .filter((part) => part !== '')
    .join(' ');

  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link to="/" className="shrink-0 text-base font-bold tracking-tight text-slate-900">
            수업·업무 도구함
          </Link>
          {context === '' ? null : (
            <span className="hidden truncate text-sm text-slate-500 sm:inline">{context}</span>
          )}

          <nav className="ml-auto flex items-center gap-1">
            {FEATURE_NAV.map(({ id, path, label, icon: Icon }) => (
              <NavLink
                key={id}
                to={path}
                end={path === '/'}
                aria-label={label}
                className={({ isActive }) =>
                  [
                    'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  ].join(' ')
                }
              >
                <Icon className="size-4" aria-hidden />
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}

            <NavLink
              to="/settings"
              aria-label="설정"
              className={({ isActive }) =>
                [
                  'ml-1 rounded-control p-1.5 transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')
              }
            >
              <Settings className="size-4" aria-hidden />
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
