/*
 * G-classroom-suite에서 가져온 공통 계층입니다.
 * 두 저장소가 각각 fork되므로 패키지로 빼지 않고 복사해 씁니다.
 * 고칠 일이 생기면 양쪽을 함께 손봐야 합니다.
 */
/** 조건부 클래스 결합. clsx를 쓸 만큼 복잡하지 않아 직접 둔다. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
