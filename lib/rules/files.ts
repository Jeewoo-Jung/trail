// Design Ref: DESIGN.md §14.6 — 첨부 파일 이름·경로 규칙(순수 함수). 파일은 브라우저가 Supabase Storage로 직접 올린다.
// 경로는 "<내 id>/<노드 id>/<무작위>-<안전한 파일 이름>"이고, 버킷 규칙(RLS)이 첫 폴더가 내 id일 때만 접근을 허용한다.
import { FILE_LIMITS } from "./limits";
import { countChars } from "./text";

/** 폴더 구분·제어 문자·공백 등을 "_"로 바꾸고 길이를 줄인다. 한글·영문·숫자·. _ - 은 그대로 둔다. */
export function safeFileName(name: string): string {
  const base = name.normalize("NFC").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^[._]+/, "").replace(/_+/g, "_");
  if (cleaned === "") return "file";
  if (countChars(cleaned) <= FILE_LIMITS.nameMaxChars) return cleaned;
  // 길면 확장자는 남기고 앞부분을 줄인다
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return Array.from(cleaned.slice(0, dot > 0 && ext ? dot : undefined)).slice(0, FILE_LIMITS.nameMaxChars - Array.from(ext).length).join("") + ext;
}

export const buildStoragePath = (userId: string, nodeId: string, unique: string, fileName: string): string => `${userId}/${nodeId}/${unique}-${safeFileName(fileName)}`;

export type FileCheck = { ok: true } | { ok: false; message: string };
export function checkFile(file: { size: number; name: string }): FileCheck {
  if (file.size <= 0) return { ok: false, message: "빈 파일은 올릴 수 없습니다." };
  if (file.size > FILE_LIMITS.maxBytes) return { ok: false, message: `파일은 ${FILE_LIMITS.maxBytes / 1024 / 1024}MB 이하여야 합니다.` };
  if (file.name.trim() === "") return { ok: false, message: "파일 이름이 없습니다." };
  return { ok: true };
}
