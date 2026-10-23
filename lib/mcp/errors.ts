/** 저장소 오류. 메시지에는 어떤 일이었는지와 코드만 담고, 내용은 담지 않는다. */
export class StoreError extends Error {
  constructor(
    what: string,
    readonly code?: string,
  ) {
    super(`${what} 실패${code ? ` (코드 ${code})` : ""}`);
    this.name = "StoreError";
  }
}
