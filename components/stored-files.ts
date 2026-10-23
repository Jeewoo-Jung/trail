// 첨부 파일을 브라우저가 Supabase Storage와 직접 주고받는 작은 함수들(서버·Vercel을 거치지 않는다).
// 접근 규칙(RLS)은 서버(Storage)에서 걸려 있어, 여기 코드가 틀려도 내 폴더 밖은 읽고 쓸 수 없다.
import { createClient } from "@/lib/supabase/client";
import { buildStoragePath, checkFile } from "@/lib/rules/files";

export const BUCKET = "trail-files";
const NOT_READY = "파일 저장소가 아직 준비되지 않았습니다. 잠시 뒤 다시 시도하거나, 링크로 등록해 주세요.";
const friendly = (message: string) => (/bucket not found/i.test(message) ? NOT_READY : "파일을 올리지 못했습니다. 잠시 뒤 다시 시도해 주세요.");

export async function uploadOutputFile(userId: string, nodeId: string, file: File): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const checked = checkFile(file);
  if (!checked.ok) return checked;
  const path = buildStoragePath(userId, nodeId, crypto.randomUUID(), file.name);
  const { error } = await createClient().storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  return error ? { ok: false, message: friendly(error.message) } : { ok: true, path };
}

/** 60초만 유효한 임시 주소를 받아 새 탭으로 연다 */
export async function openStoredFile(path: string): Promise<string | null> {
  const { data, error } = await createClient().storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) return "파일을 열지 못했습니다.";
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  return null;
}

export async function removeStoredFile(path: string): Promise<void> {
  await createClient().storage.from(BUCKET).remove([path]);
}
