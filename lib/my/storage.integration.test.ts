// 진짜 Supabase Storage에서 첨부 파일 버킷(trail-files)의 접근 규칙을 시험한다. (PLAN 37번)
// 버킷이 아직 없으면(마이그레이션 적용 전) 건너뛰지 않고 실패한다 — 적용 여부를 알려 주기 위해서다. 시험이 올린 파일은 끝에 모두 지운다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStoragePath } from "../rules/files";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TRAIL_LOGIN_EMAIL;
const password = process.env.TRAIL_LOGIN_PASSWORD;
const enabled = Boolean(url && key && email && password);
const BUCKET = "trail-files";
const OTHER_USER = "00000000-0000-4000-8000-000000000001";
const NODE = "00000000-0000-4000-8000-000000000002";

describe.skipIf(!enabled)("첨부 파일 버킷 (실제 로그인으로 시험)", () => {
  let client: SupabaseClient;
  let uid = "";
  const uploaded: string[] = [];
  const blob = (text: string) => new Blob([text], { type: "text/plain" });

  beforeAll(async () => {
    client = createClient(url!, key!);
    const { data, error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("로그인하지 못했습니다.");
    uid = data.user.id;
  });
  afterAll(async () => {
    if (!client) return;
    if (uploaded.length) await client.storage.from(BUCKET).remove(uploaded);
    await client.auth.signOut({ scope: "local" });
  });

  it("내 폴더에는 올리고, 임시 주소로 읽고, 지울 수 있다", async () => {
    const path = buildStoragePath(uid, NODE, crypto.randomUUID(), "__시험 보고서 report.txt");
    const up = await client.storage.from(BUCKET).upload(path, blob("가상 내용"), { upsert: false });
    expect(up.error).toBeNull();
    uploaded.push(path);
    const signed = await client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const res = await fetch(signed.data!.signedUrl);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("가상 내용");
    expect((await client.storage.from(BUCKET).remove([path])).error).toBeNull();
    expect((await client.storage.from(BUCKET).download(path)).error).not.toBeNull();
    uploaded.length = 0;
  });

  it("한글 파일 이름도 ASCII로 줄인 경로로 올라간다(Storage 키는 ASCII만 허용)", async () => {
    const path = buildStoragePath(uid, NODE, crypto.randomUUID(), "최종 보고서.pdf");
    expect(path).toMatch(/^[A-Za-z0-9._\/-]+$/);
    expect((await client.storage.from(BUCKET).upload(path, blob("가상"), { upsert: false })).error).toBeNull();
    uploaded.push(path);
    // 사람이 보는 원래 이름은 경로가 아니라 산출물 이름에 저장하므로, 한글 키를 직접 쓰면 거절되는 것이 정상이다
    expect((await client.storage.from(BUCKET).upload(`${uid}/${NODE}/한글.txt`, blob("x"))).error).not.toBeNull();
  });

  it("남의 폴더로는 올리거나 읽을 수 없다", async () => {
    const path = buildStoragePath(OTHER_USER, NODE, crypto.randomUUID(), "__시험.txt");
    const up = await client.storage.from(BUCKET).upload(path, blob("x"), { upsert: false });
    expect(up.error).not.toBeNull();
    expect((await client.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
    const rootFile = `__시험루트-${crypto.randomUUID()}.txt`; // 내 폴더가 아닌 맨 위에도 못 올린다
    expect((await client.storage.from(BUCKET).upload(rootFile, blob("x"))).error).not.toBeNull();
  });

  it("로그인하지 않은 연결로는 올리거나 읽거나 지울 수 없다", async () => {
    const anon = createClient(url!, key!);
    const path = buildStoragePath(uid, NODE, crypto.randomUUID(), "__시험익명.txt");
    expect((await anon.storage.from(BUCKET).upload(path, blob("x"))).error).not.toBeNull();
    expect((await anon.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await anon.storage.from(BUCKET).list(uid)).data ?? []).toHaveLength(0);
    // 내가 올린 파일이 있어도 공개 주소로는 열리지 않는다(비공개 버킷)
    const mine = buildStoragePath(uid, NODE, crypto.randomUUID(), "__시험비공개.txt");
    expect((await client.storage.from(BUCKET).upload(mine, blob("비공개"))).error).toBeNull();
    uploaded.push(mine);
    const publicUrl = anon.storage.from(BUCKET).getPublicUrl(mine).data.publicUrl;
    expect((await fetch(publicUrl)).status).toBeGreaterThanOrEqual(400);
  });

  it("버킷 한도(25MB)를 넘는 파일은 거절한다", async () => {
    const path = buildStoragePath(uid, NODE, crypto.randomUUID(), "big.bin");
    const big = new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: "application/octet-stream" });
    const res = await client.storage.from(BUCKET).upload(path, big, { upsert: false });
    expect(res.error).not.toBeNull();
    if (!res.error) uploaded.push(path); // 혹시 올라갔다면 끝에 지운다
  }, 120000);

  it("같은 경로에 덮어쓰기는 막는다(upsert 거부)", async () => {
    const path = buildStoragePath(uid, NODE, crypto.randomUUID(), "__시험중복.txt");
    expect((await client.storage.from(BUCKET).upload(path, blob("1"))).error).toBeNull();
    uploaded.push(path);
    expect((await client.storage.from(BUCKET).upload(path, blob("2"), { upsert: false })).error).not.toBeNull();
  });
});
