# 진행 상황 — 수업·업무 도구함 (2단계)

설계 문서: [`docs/superpowers/specs/2026-08-12-teacher-toolkit-design.md`](docs/superpowers/specs/2026-08-12-teacher-toolkit-design.md)
1단계: [`G-classroom-suite`](https://github.com/limhs06082-eng/G-classroom-suite) — 완료

## 검증 게이트

```bash
npm run verify
```

`lint`(tsc) → `test`(vitest) → `build`(vite). 하나라도 실패하면 멈춘다.

## 단계별 상태

| 단계 | 내용 | 상태 |
|---:|---|---|
| 0 | 설계 문서 | ✅ |
| 1 | 스캐폴딩 + shared 계층 이식 | ✅ |
| 2 | `features/lesson` 수업 진행판 | ✅ 완료 |
| 3 | `features/quiz` 형성평가 | ✅ 완료 |
| 4 | `features/task` 업무 체크리스트 | ✅ 완료 |
| 5 | `features/message` 문구 템플릿 + api/refine | ✅ 완료 |
| 6 | 홈 + 설정·백업 + 기존 앱 가져오기 + README | ✅ 완료 |

2단계 화면 작업이 모두 끝났다.

## 그 뒤에 더한 것

| 내용 | 상태 | 설계·계획 |
|---|---|---|
| 창·기기 간 동기화 (`StorageAdapter.subscribe`) | ✅ | `G-classroom-suite`의 `2026-08-13-cross-window-sync-design.md` |
| 형성평가 학생 응답 수집 (QR·6자 코드) | ✅ | [`specs/2026-08-14-quiz-live-responses-design.md`](docs/superpowers/specs/2026-08-14-quiz-live-responses-design.md) |
| `docs/firebase-guide.md` | ✅ | — |

`npm run verify` 통과(테스트 185개).

학생 응답 수집은 **Firebase를 붙여야 학생 휴대폰이 들어온다.**
붙이기 전에도 `LocalSessionRelay`로 같은 브라우저에서 흐름 전체가 동작한다.

## 지켜야 할 것

- **기능 코드는 localStorage를 직접 부르지 않는다.** 전부 `useToolkit().update`를 거친다.
- 저장 키는 `teacher-toolkit:v1:` 접두사를 강제한다 (원본 퀴즈 앱의 `settings` 같은 일반 키 금지).
- 필수 환경변수를 만들지 않는다. Gemini 키는 설정 화면에서 사용자가 넣는다.
- `src/shared/ui`와 `src/shared/storage`는 G-classroom-suite에서 복사한 것이다.
  고칠 일이 생기면 양쪽을 함께 손봐야 한다.
