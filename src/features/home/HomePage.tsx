import { ArrowRight, Download, Shield } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { FEATURE_NAV } from '../../app/navigation';
import { useToolkit } from '../../shared/state/ToolkitDataProvider';
import { Button, Card, cx, useToast } from '../../shared/ui';
import { summarizeTasks } from '../task/taskCore';

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** 마지막 백업 이후 며칠 지났는지. 1단계와 같은 기준을 쓴다. */
const BACKUP_REMINDER_DAYS = 14;

/**
 * 홈.
 *
 * 도구 네 개가 각자 무엇을 갖고 있는지 한눈에 보여 준다.
 * 1단계와 달리 도구끼리 자료를 주고받지 않으므로 요약도 서로 독립이다.
 */
export default function HomePage() {
  const { data } = useToolkit();
  const today = todayString();

  const taskSummary = useMemo(() => summarizeTasks(data.tasks, today), [data.tasks, today]);

  const summaries: Record<string, { value: string; note: string }> = {
    lesson: {
      value: `${data.lessonTemplates.length}개`,
      note:
        data.lessonRun !== null
          ? '지금 수업 진행 중'
          : data.lessonTemplates.length === 0
            ? '수업 흐름을 만들어 보세요'
            : '수업 흐름',
    },
    quiz: {
      value: `${data.quizSets.length}개`,
      note:
        data.quizRun !== null
          ? '지금 퀴즈 진행 중'
          : data.quizResults.length > 0
            ? `지난 결과 ${data.quizResults.length}건`
            : '문제 세트',
    },
    task: {
      value: `${taskSummary.open}개`,
      note:
        taskSummary.overdue > 0
          ? `기한 초과 ${taskSummary.overdue}건`
          : taskSummary.today > 0
            ? `오늘 ${taskSummary.today}건`
            : '진행 중인 업무',
    },
    message: {
      value: `${data.messageTemplates.length}개`,
      note:
        data.messageFavorites.length > 0
          ? `즐겨찾기 ${data.messageFavorites.length}개`
          : '내가 만든 문구',
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-900">수업·업무 도구함</h1>
        <p className="mt-1 text-sm text-slate-600">
          수업 진행판·형성평가·업무 체크리스트·문구 템플릿을 한 곳에 모았습니다.
        </p>
      </header>

      <BackupBanner />

      <div className="grid gap-3 sm:grid-cols-2">
        {FEATURE_NAV.filter((item) => item.id !== 'home').map((item) => {
          const summary = summaries[item.id];
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              to={item.path}
              className="group flex flex-col rounded-card border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cx(
                    'inline-flex size-8 items-center justify-center rounded-control',
                    item.tintClass,
                  )}
                >
                  <Icon className={cx('size-4', item.accentClass)} aria-hidden />
                </span>
                <h2 className="text-sm font-semibold text-slate-900">{item.label}</h2>
              </div>

              <p className="mt-3 flex items-baseline gap-1">
                <span data-numeric className="text-2xl font-bold text-slate-900">{summary?.value ?? '—'}</span>
              </p>
              <p className="mt-0.5 text-sm text-slate-500">{summary?.note ?? ''}</p>

              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 group-hover:text-brand-700">
                열기
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>

      {data.profile.schoolName === '' ? (
        <Card>
          <p className="text-sm text-slate-600">
            <Link to="/settings" className="font-medium text-brand-600 hover:text-brand-700">
              설정에서 학교와 학년·반을 넣어 두시면
            </Link>{' '}
            문구 템플릿이 자동으로 채워집니다.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * 백업 권유 배너.
 *
 * 지킬 자료가 있을 때만, 오래 안 했을 때만 나타난다.
 * 1단계에서 검증한 기준을 그대로 쓴다.
 */
function BackupBanner() {
  const { data, adapter, flush } = useToolkit();
  const toast = useToast();

  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const value = await adapter.getLastExportedAt();
      if (cancelled) return;
      setLastExportedAt(value);
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const hasContent =
    data.lessonTemplates.length + data.quizSets.length + data.tasks.length + data.messageTemplates.length > 0;

  if (!checked || dismissed || !hasContent) return null;

  const days =
    lastExportedAt === null
      ? null
      : Math.floor((Date.now() - Date.parse(lastExportedAt)) / (24 * 60 * 60 * 1000));

  // 시계가 뒤로 간 경우에는 조르지 않는다.
  if (days !== null && (Number.isNaN(days) ? false : days < BACKUP_REMINDER_DAYS)) return null;

  const handleExport = async (): Promise<void> => {
    try {
      await flush();
      const json = await adapter.exportJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `수업업무-백업-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setDismissed(true);
      toast.success('백업 파일을 내려받았습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '백업 파일을 만들지 못했습니다.');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-warning-200 bg-warning-50 p-3">
      <Shield className="size-5 shrink-0 text-warning-700" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-warning-700">
        {lastExportedAt === null
          ? '아직 백업한 적이 없습니다. 브라우저 기록을 지우면 만들어 둔 자료가 모두 사라집니다.'
          : `마지막 백업이 ${days}일 전입니다.`}
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="primary" icon={Download} onClick={() => void handleExport()}>
          지금 백업하기
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          나중에
        </Button>
      </div>
    </div>
  );
}
