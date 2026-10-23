// Design Ref: DESIGN.md §4.1 ② — 요청 본문이 20KB를 넘으면 읽다가 멈추고 거절한다(끝까지 메모리에 올리지 않는다).
import { REQUEST_LIMITS } from "../rules/limits";

export type LimitedRequest = { ok: true; request: Request; bytes: number } | { ok: false };

export async function limitRequestBody(request: Request, maxBytes: number = REQUEST_LIMITS.maxBytes): Promise<LimitedRequest> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };
  if (!request.body) return { ok: true, request, bytes: 0 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, request: new Request(request.url, { method: request.method, headers: request.headers, body }), bytes: total };
}
