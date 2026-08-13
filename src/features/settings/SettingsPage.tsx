import { Download, Key, RotateCcw, School, Shield, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useToolkit } from '../../shared/state/ToolkitDataProvider';
import type { BackupSummary } from '../../shared/storage/StorageAdapter';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Tabs, useToast } from '../../shared/ui';
import { GEMINI_KEY_STORAGE, saveGeminiKey } from '../message/refineClient';
import { importLegacy, scanLegacy, type LegacyScan } from './legacyImport';

type SettingsTab = 'school' | 'backup' | 'legacy';

/** 설정. 백업·복원이 중심이다. */
export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('school');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">설정</h1>

      <Tabs
        items={[
          { id: 'school', label: '학교 정보' },
          { id: 'backup', label: '백업·복원' },
          { id: 'legacy', label: '기존 앱에서 가져오기' },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as SettingsTab)}
      >
        {tab === 'school' ? <SchoolTab /> : tab === 'backup' ? <BackupTab /> : <LegacyTab />}
      </Tabs>
    </div>
  );
}

function SchoolTab() {
  const { data, update } = useToolkit();
  const toast = useToast();
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    try {
      setApiKey(window.localStorage.getItem(GEMINI_KEY_STORAGE) ?? '');
    } catch {
      setApiKey('');
    }
  }, []);

  const field = (
    label: string,
    key: 'schoolName' | 'teacherName' | 'grade' | 'classNo',
    placeholder: string,
  ) => (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <input
        defaultValue={data.profile[key]}
        placeholder={placeholder}
        onBlur={(event) => {
          const value = event.target.value.trim();
          if (value === data.profile[key]) return;
          update((current) => ({ ...current, profile: { ...current.profile, [key]: value } }));
          toast.success(`${label}을(를) 저장했습니다.`);
        }}
        className="mt-1 h-10 w-full rounded-control border border-slate-300 px-3"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card title="학교와 선생님" icon={School}>
        <div className="flex max-w-md flex-col gap-3">
          {field('학교 이름', 'schoolName', '한빛초등학교')}
          {field('선생님 이름', 'teacherName', '임한솔')}
          <div className="flex gap-3">
            <div className="flex-1">{field('학년', 'grade', '3')}</div>
            <div className="flex-1">{field('반', 'classNo', '2')}</div>
          </div>
          <p className="text-sm text-slate-500">
            문구 템플릿의 {'{학교}'} {'{학년}'} {'{반}'} {'{교사}'} 자리에 자동으로 들어갑니다.
          </p>
        </div>
      </Card>

      <Card title="AI 문장 다듬기 (선택)" icon={Key}>
        <div className="flex max-w-md flex-col gap-3">
          <p className="text-sm text-slate-600">
            Gemini API 키를 넣으면 문구 템플릿에서 문장을 다듬을 수 있습니다.
            <strong className="font-semibold"> 넣지 않아도 나머지 기능은 모두 동작합니다.</strong>
          </p>

          <label className="block text-sm">
            <span className="text-slate-700">Gemini API 키</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="AIza..."
              className="mt-1 h-10 w-full rounded-control border border-slate-300 px-3 font-mono"
            />
          </label>

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                saveGeminiKey(apiKey);
                toast.success(apiKey.trim() === '' ? '키를 지웠습니다.' : '키를 저장했습니다.');
              }}
            >
              키 저장
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setApiKey('');
                saveGeminiKey('');
                toast.info('키를 지웠습니다.');
              }}
            >
              키 지우기
            </Button>
          </div>

          <p className="text-sm text-slate-500">
            키는 이 브라우저에만 저장되고 백업 파일에는 들어가지 않습니다.
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-brand-600 hover:text-brand-700"
            >
              키 발급받기
            </a>
          </p>
        </div>
      </Card>
    </div>
  );
}

function BackupTab() {
  const { adapter, flush } = useToolkit();
  const toast = useToast();

  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<BackupSummary | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const refresh = async (): Promise<void> => {
    setBackups(await adapter.listBackups());
    setLastExportedAt(await adapter.getLastExportedAt());
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async (): Promise<void> => {
    try {
      // 대기 중인 변경이 백업 파일에서 빠지면 안 된다.
      await flush();

      const json = await adapter.exportJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `수업업무-백업-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      await refresh();
      toast.success('백업 파일을 내려받았습니다. 클라우드나 USB에 보관해 주세요.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '백업 파일을 만들지 못했습니다.');
    }
  };

  const handleImport = async (file: File): Promise<void> => {
    const result = await adapter.importJson(await file.text());

    if (!result.ok) {
      toast.error(result.message ?? '가져오지 못했습니다.');
      return;
    }
    for (const repair of result.repairs) {
      if (repair.severity === 'warning') toast.warning(repair.message);
    }

    toast.success('가져왔습니다. 화면을 새로 고칩니다.');
    window.setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="백업" icon={Shield}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            이 앱은 자료를 이 브라우저에만 저장합니다. 브라우저 기록을 지우거나 다른 기기를 쓰면
            자료가 보이지 않습니다.{' '}
            <strong className="font-semibold">정기적으로 파일로 내려받아 두세요.</strong>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={Download} onClick={() => void handleExport()}>
              지금 백업하기
            </Button>

            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="size-4" aria-hidden />
              백업 파일 가져오기
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImport(file);
                  event.target.value = '';
                }}
              />
            </label>

            {lastExportedAt === null ? (
              <Badge tone="warning">아직 백업한 적 없음</Badge>
            ) : (
              <Badge tone="success">마지막 백업 {lastExportedAt.slice(0, 10)}</Badge>
            )}
          </div>
        </div>
      </Card>

      <Card
        title={`자동 백업 ${backups.length}개`}
        icon={RotateCcw}
        action={
          backups.length === 0 ? null : (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => {
                void (async () => {
                  await adapter.clearBackups();
                  await refresh();
                  toast.info('자동 백업을 모두 지웠습니다.');
                })();
              }}
            >
              모두 지우기
            </Button>
          )
        }
      >
        {backups.length === 0 ? (
          <EmptyState
            title="아직 자동 백업이 없습니다"
            description="자료를 바꾸면 앱이 알아서 직전 상태를 남깁니다. 되돌리기 어려운 작업 직전에도 남습니다."
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {backups.map((backup) => (
              <li
                key={backup.id}
                className="flex flex-wrap items-center gap-2 rounded-control border border-slate-200 px-2.5 py-1.5 text-sm"
              >
                <span className="w-32 shrink-0 text-slate-500">
                  {backup.createdAt.slice(5, 16).replace('T', ' ')}
                </span>
                <span className="min-w-0 flex-1 truncate">{backup.reason}</span>
                {backup.kind === 'guard' ? <Badge tone="brand">보호</Badge> : null}
                <Button size="sm" variant="secondary" onClick={() => setRestoring(backup)}>
                  이 시점으로 되돌리기
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="위험 구역">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmReset(true)}>
            전체 초기화
          </Button>
          <p className="text-sm text-slate-500">
            수업 흐름·문제 세트·업무·문구가 모두 지워집니다. 직전 상태는 자동 백업에 남습니다.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={restoring !== null}
        title="이 시점으로 되돌릴까요?"
        description={`${restoring?.createdAt.slice(0, 16).replace('T', ' ') ?? ''} 상태로 돌아갑니다. 그 뒤에 바뀐 내용은 사라집니다. 지금 상태도 백업으로 남으니 다시 되돌릴 수 있습니다.`}
        confirmLabel="되돌리기"
        onCancel={() => setRestoring(null)}
        onConfirm={() => {
          if (restoring === null) return;
          void (async () => {
            const result = await adapter.restoreBackup(restoring.id);
            setRestoring(null);

            if (!result.ok) {
              toast.error(result.message ?? '되돌리지 못했습니다.');
              return;
            }
            toast.success('되돌렸습니다. 화면을 새로 고칩니다.');
            window.setTimeout(() => window.location.reload(), 600);
          })();
        }}
      />

      <ConfirmDialog
        open={confirmReset}
        title="정말 전체를 초기화할까요?"
        description="수업 흐름·문제 세트·퀴즈 결과·업무·문구가 모두 지워집니다. 되돌릴 수 있도록 직전 상태를 자동 백업에 남깁니다."
        destructive
        confirmPhrase="초기화"
        confirmLabel="전체 초기화"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          void (async () => {
            await adapter.reset();
            setConfirmReset(false);
            toast.warning('전체를 초기화했습니다.');
            window.setTimeout(() => window.location.reload(), 600);
          })();
        }}
      />
    </div>
  );
}

/**
 * 기존 앱에서 가져오기.
 *
 * 원본 4개 앱은 같은 브라우저의 다른 키에 자료를 남겨 두었다.
 * 원본 키는 지우지 않는다. 옮기기가 잘못돼도 되돌아갈 곳이 있어야 한다.
 */
function LegacyTab() {
  const { update, guard } = useToolkit();
  const toast = useToast();

  const [scan, setScan] = useState<LegacyScan | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setScan(scanLegacy(window.localStorage));
  }, []);

  if (scan === null) return null;

  if (scan.sources.length === 0) {
    return (
      <Card title="기존 앱에서 가져오기">
        <EmptyState
          title="이 브라우저에서 원본 앱 자료를 찾지 못했습니다"
          description="원본 앱을 쓰던 브라우저에서 이 화면을 열어야 합니다. 다른 기기라면 그쪽에서 백업 파일을 내려받아 백업·복원 탭에서 가져오세요."
        />
      </Card>
    );
  }

  return (
    <Card title="기존 앱에서 가져오기">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          이 브라우저에서 원본 앱 자료를 찾았습니다. 지금 자료에 <strong className="font-semibold">더해서</strong> 가져옵니다.
          원본 자료는 지우지 않으므로 언제든 원래 앱으로 돌아갈 수 있습니다.
        </p>

        <ul className="flex flex-col gap-1">
          {scan.sources.map((source) => (
            <li
              key={source.key}
              className="flex items-center gap-2 rounded-control border border-slate-200 px-2.5 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{source.label}</span>
              <Badge tone={source.count > 0 ? 'success' : 'neutral'}>{source.count}건</Badge>
            </li>
          ))}
        </ul>

        <Button
          variant="primary"
          icon={Upload}
          className="self-start"
          disabled={scan.total === 0}
          onClick={() => setConfirming(true)}
        >
          가져오기
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="기존 앱 자료를 가져올까요?"
        description="지금 자료를 지우지 않고 더합니다. 가져오기 직전 상태는 자동으로 백업됩니다."
        confirmLabel="가져오기"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          void (async () => {
            await guard('기존 앱 자료 가져오기 직전');

            let imported = 0;
            update((current) => {
              const result = importLegacy(current, window.localStorage);
              imported = result.imported;
              return result.data;
            });

            setConfirming(false);
            toast[imported === 0 ? 'warning' : 'success'](
              imported === 0 ? '새로 가져올 자료가 없습니다.' : `${imported}건을 가져왔습니다.`,
            );
          })();
        }}
      />
    </Card>
  );
}
