/*
 * G-classroom-suite에서 가져온 공통 계층입니다.
 * 두 저장소가 각각 fork되므로 패키지로 빼지 않고 복사해 씁니다.
 * 고칠 일이 생기면 양쪽을 함께 손봐야 합니다.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from './cx';

interface Props {
  title?: ReactNode;
  /** 제목 옆 아이콘. 기능 카드에서 영역 색과 함께 쓴다. */
  icon?: LucideIcon;
  /** 예: 'text-duty-500' — navigation.ts의 accentClass를 그대로 넘긴다. */
  accentClass?: string;
  /** 제목 줄 오른쪽 영역 (버튼·필터 등) */
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Card({
  title,
  icon: Icon,
  accentClass,
  action,
  className,
  bodyClassName,
  children,
}: Props) {
  return (
    <section className={cx('rounded-card border border-slate-200 bg-white shadow-sm', className)}>
      {title === undefined && action === undefined ? null : (
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          {Icon ? <Icon className={cx('size-4 shrink-0', accentClass ?? 'text-slate-400')} aria-hidden /> : null}
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-900">{title}</h2>
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
