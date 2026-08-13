/*
 * G-classroom-suite의 SuiteDataProvider를 이 저장소에 맞게 고친 파일입니다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createEmptyToolkitData } from '../domain/factories';
import type { ToolkitData } from '../domain/types';
import { LocalStorageAdapter } from '../storage/LocalStorageAdapter';
import type { BackupKind, StorageAdapter } from '../storage/StorageAdapter';
import { useToast } from '../ui';

/**
 * 앱 전역 데이터 공급자.
 *
 * 모든 기능이 여기서 학생 명단을 가져간다. 이것이 통합의 핵심이다.
 * 원본에서는 5개 앱이 각자 localStorage를 직접 읽고 썼다.
 *
 * 저장은 디바운스한다. 보상 점수 입력은 수업 중 분당 수 회 일어나므로
 * 변경마다 직렬화하면 입력이 버벅인다.
 */

const SAVE_DEBOUNCE_MS = 600;

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

interface ToolkitContextValue {
  data: ToolkitData;
  /** 첫 로딩이 끝나기 전에는 화면을 그리지 않는다 */
  isLoading: boolean;
  /** 저장된 데이터가 없어 설정 마법사로 보내야 하는 상태 */
  isFirstRun: boolean;
  saveState: SaveState;

  /** 데이터를 바꾼다. 반환한 객체가 새 상태가 된다. */
  update: (recipe: (current: ToolkitData) => ToolkitData) => void;
  /** 되돌릴 수 없는 작업 직전에 부른다. */
  guard: (reason: string) => Promise<void>;
  /** 대기 중인 저장을 즉시 밀어낸다. */
  flush: () => Promise<void>;

  adapter: StorageAdapter;
}

const ToolkitContext = createContext<ToolkitContextValue | null>(null);

export function useToolkit(): ToolkitContextValue {
  const value = useContext(ToolkitContext);
  if (value === null) {
    throw new Error('useToolkit는 ToolkitDataProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}

interface Props {
  /** 테스트에서 주입한다. 기본은 localStorage 구현. */
  adapter?: StorageAdapter;
  children: ReactNode;
}

export function ToolkitDataProvider({ adapter: injected, children }: Props) {
  const toast = useToast();

  const adapter = useMemo<StorageAdapter>(() => injected ?? new LocalStorageAdapter(), [injected]);

  const [data, setData] = useState<ToolkitData>(createEmptyToolkitData);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 저장 대기 중인 최신 상태. 디바운스 도중 값이 또 바뀔 수 있다. */
  const pendingRef = useRef<ToolkitData | null>(null);
  /**
   * 최신 상태의 거울.
   *
   * setData의 함수형 갱신 안에서 복구 결과를 알리면 부수효과가 렌더 중에 일어나고,
   * StrictMode에서 갱신 함수가 두 번 불려 알림이 두 번 뜬다.
   * 그래서 다음 상태를 갱신 함수 밖에서 계산한다. 연속 호출에도 값이 밀리지 않도록
   * 여기에 즉시 반영한다.
   */
  const dataRef = useRef<ToolkitData>(data);

  // ── 최초 로딩 ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await adapter.load();
        if (cancelled) return;

        dataRef.current = result.data;
        setData(result.data);
        setIsFirstRun(result.isFirstRun);

        // 자동으로 고친 내용은 반드시 알린다. 조용히 고치지 않는다.
        for (const repair of result.repairs) {
          if (repair.severity === 'warning') toast.warning(repair.message);
          else toast.info(repair.message);
        }
      } catch (error) {
        if (cancelled) return;
        toast.error(
          error instanceof Error ? error.message : '저장된 데이터를 불러오지 못했습니다.',
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // toast는 Provider 수명 동안 안정적이다. adapter만 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  // ── 저장 ─────────────────────────────────────────────────
  const persist = useCallback(
    async (next: ToolkitData): Promise<void> => {
      setSaveState('saving');
      try {
        await adapter.save(next);
        setSaveState('saved');
      } catch (error) {
        setSaveState('failed');
        // 저장 실패는 데이터를 잃는 사고로 이어진다. 자동으로 닫히지 않는 오류로 띄운다.
        toast.error(
          error instanceof Error ? error.message : '저장하지 못했습니다. 데이터를 내보내 백업해 주세요.',
        );
      }
    },
    [adapter, toast],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending !== null) await persist(pending);
  }, [persist]);

  const update = useCallback(
    (recipe: (current: ToolkitData) => ToolkitData): void => {
      /*
       * 1단계와 달리 여기에는 참조 무결성 검사가 없다.
       * 네 도구가 서로의 자료를 가리키지 않기 때문에, 형태가 맞는지만 보면 된다.
       * 형태 검사는 불러올 때 schema.ts가 한다.
       */
      const next = recipe(dataRef.current);

      dataRef.current = next;
      setData(next);

      pendingRef.current = next;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending !== null) void persist(pending);
      }, SAVE_DEBOUNCE_MS);
    },
    [persist, toast],
  );

  const guard = useCallback(
    async (reason: string): Promise<void> => {
      // 백업은 현재 화면 상태 기준이어야 하므로 대기 중인 저장을 먼저 밀어낸다.
      await flush();
      await adapter.createBackup(reason, 'guard' satisfies BackupKind);
    },
    [adapter, flush],
  );

  // 탭을 닫을 때 대기 중인 변경을 잃지 않는다.
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      const pending = pendingRef.current;
      if (pending !== null) void adapter.save(pending);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [adapter]);

  const value = useMemo<ToolkitContextValue>(
    () => ({ data, isLoading, isFirstRun, saveState, update, guard, flush, adapter }),
    [data, isLoading, isFirstRun, saveState, update, guard, flush, adapter],
  );

  return <ToolkitContext.Provider value={value}>{children}</ToolkitContext.Provider>;
}
