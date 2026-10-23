// Design Ref: DESIGN.md §14.6 — 첨부 파일 이름·경로 규칙(순수 함수). 파일은 브라우저가 Supabase Storage로 직접 올린다.
// 경로는 "<내 id>/<노드 id>/<무작위>-<ASCII로 줄인 파일 이름>"이고, 버킷 규칙(RLS)이 첫 폴더가 내 id일 때만 접근을 허용한다.
import { FILE_LIMITS } from "./limits";

/**
 * Storage의 파일 키에는 ASCII 글자만 쓸 수 있다(한글 등은 "Invalid key"로 거절된다). 그래서 경로에 쓰는 이름은 영문·숫자·. _ - 만 남기고,
 * 나머지는 "_"로 바꿔 줄인다. 사람이 보는 원래 파일 이름은 산출물 이름(outputs.name)에 따로 저장한다.
 * 확장자(짧은 영문·숫자)는 남기고, 이름이 모두 사라지면 "file"이 된다.
 */
export function safeFileName(name: string): string {
  const base = (name.normalize("NFC").split(/[\\/]/).pop() ?? "").trim();
  const dot = base.lastIndexOf(".");
  const rawExt = dot > 0 ? base.slice(dot + 1) : "";
  const ext = /^[A-Za-z0-9]{1,10}$/.test(rawExt) ? `.${rawExt.toLowerCase()}` : "";
  const stem = (ext ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  const kept = stem.slice(0, FILE_LIMITS.nameMaxChars - ext.length);
  return `${kept === "" ? "file" : kept}${ext}`;
}

export const buildStoragePath = (userId: string, nodeId: string, unique: string, fileName: string): string => `${userId}/${nodeId}/${unique}-${safeFileName(fileName)}`;

export type FileCheck = { ok: true } | { ok: false; message: string };
export function checkFile(file: { size: number; name: string }): FileCheck {
  if (file.size <= 0) return { ok: false, message: "빈 파일은 올릴 수 없습니다." };
  if (file.size > FILE_LIMITS.maxBytes) return { ok: false, message: `파일은 ${FILE_LIMITS.maxBytes / 1024 / 1024}MB 이하여야 합니다.` };
  if (file.name.trim() === "") return { ok: false, message: "파일 이름이 없습니다." };
  return { ok: true };
}
