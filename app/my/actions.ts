"use server";

// 노드·활동 카드 편집 동작. 화면의 버튼이 값을 넘겨 부르고 결과 문구를 받아 보여 준다.
// 서버에서 다시 로그인과 값 모양(uuid·열거값)을 확인하고, 내용 규칙은 lib/rules/nodes.ts가, 저장은 lib/my/node-edit.ts가 한다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import * as edit from "@/lib/my/node-edit";
import type { EditResult } from "@/lib/my/node-edit";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const FAILED: EditResult = { ok: false, message: "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
const id = z.uuid();
const idOrNull = z.uuid().nullable();
const evidenceInput = z.object({ conversationTitle: z.string().max(300), conversationDate: z.string().max(20), excerpt: z.string().max(2000) });

async function run(job: (client: Awaited<ReturnType<typeof createClient>>) => Promise<EditResult>): Promise<EditResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const result = await job(await createClient());
    if (result.ok) revalidatePath("/my");
    return result;
  } catch {
    console.error("[my] 편집 실패");
    return FAILED;
  }
}
const guard = <T extends z.ZodType>(schema: T, value: unknown, job: (v: z.infer<T>) => Promise<EditResult>): Promise<EditResult> => {
  const parsed = schema.safeParse(value);
  return parsed.success ? job(parsed.data) : Promise.resolve(FAILED);
};

// ───── 노드 ─────
export async function createNodeAction(parentId: string | null, kind: string, name: string): Promise<EditResult> {
  return guard(z.object({ p: idOrNull, k: z.string().max(20), n: z.string().max(300) }), { p: parentId, k: kind, n: name }, (v) => run((c) => edit.createNode(c, { parentId: v.p, kind: v.k, name: v.n })));
}
export async function updateNodeAction(nodeId: string, patch: Record<string, string>): Promise<EditResult> {
  const allowed = z.object({ name: z.string().max(300), kind: z.string().max(20), description: z.string().max(3000), startDate: z.string().max(20), endDate: z.string().max(20), portfolioStatus: z.string().max(20) }).partial().strict();
  return guard(z.object({ id, patch: allowed }), { id: nodeId, patch }, (v) => run((c) => edit.updateNode(c, v.id, v.patch)));
}
export async function moveNodeAction(nodeId: string, parentId: string | null): Promise<EditResult> {
  return guard(z.object({ id, p: idOrNull }), { id: nodeId, p: parentId }, (v) => run((c) => edit.moveNode(c, v.id, v.p)));
}
export async function unlockNodeFieldAction(nodeId: string, which: string): Promise<EditResult> {
  return guard(z.object({ id, w: z.enum(["name", "kind", "parent", "period", "description", "portfolio_status"]) }), { id: nodeId, w: which }, (v) => run((c) => edit.unlockNodeField(c, v.id, v.w)));
}
export async function trashNodeAction(nodeId: string): Promise<EditResult> {
  return guard(id, nodeId, (v) => run((c) => edit.trashNode(c, v)));
}
export async function restoreNodeAction(nodeId: string): Promise<EditResult> {
  return guard(id, nodeId, (v) => run((c) => edit.restoreNode(c, v)));
}
export async function purgeNodeAction(nodeId: string): Promise<EditResult> {
  return guard(id, nodeId, (v) => run((c) => edit.purgeNode(c, v)));
}

// ───── STAR 항목·근거·제안 ─────
export async function setFieldAction(nodeId: string, field: string, text: string, subject: string): Promise<EditResult> {
  return guard(z.object({ id, f: z.string().max(40), t: z.string().max(3000), s: z.string().max(40) }), { id: nodeId, f: field, t: text, s: subject }, (v) => run((c) => edit.setFieldText(c, v.id, v.f, v.t, v.s)));
}
export async function setFieldSubjectAction(nodeId: string, field: string, subject: string): Promise<EditResult> {
  return guard(z.object({ id, f: z.string().max(40), s: z.string().max(40) }), { id: nodeId, f: field, s: subject }, (v) => run((c) => edit.setFieldSubject(c, v.id, v.f, v.s)));
}
export async function setFieldLockAction(nodeId: string, field: string, locked: boolean): Promise<EditResult> {
  return guard(z.object({ id, f: z.string().max(40), l: z.boolean() }), { id: nodeId, f: field, l: locked }, (v) => run((c) => edit.setFieldLock(c, v.id, v.f, v.l)));
}
export async function addEvidenceAction(nodeId: string, field: string, evidence: { conversationTitle: string; conversationDate: string; excerpt: string }): Promise<EditResult> {
  return guard(z.object({ id, f: z.string().max(40), e: evidenceInput }), { id: nodeId, f: field, e: evidence }, (v) => run((c) => edit.addEvidence(c, v.id, v.f, v.e)));
}
export async function updateEvidenceAction(evidenceId: string, evidence: { conversationTitle: string; conversationDate: string; excerpt: string }): Promise<EditResult> {
  return guard(z.object({ id, e: evidenceInput }), { id: evidenceId, e: evidence }, (v) => run((c) => edit.updateEvidence(c, v.id, v.e)));
}
export async function removeEvidenceAction(evidenceId: string): Promise<EditResult> {
  return guard(id, evidenceId, (v) => run((c) => edit.removeEvidence(c, v)));
}
export async function resolveSuggestionAction(suggestionId: string, mode: string): Promise<EditResult> {
  return guard(z.object({ id, m: z.enum(["append", "replace", "reject"]) }), { id: suggestionId, m: mode }, (v) => run((c) => edit.resolveSuggestion(c, v.id, v.m)));
}

// ───── 산출물 ─────
const outputInput = z.object({ name: z.string().max(300), url: z.string().max(1000).optional(), isFinal: z.boolean().optional() });
export async function addOutputAction(nodeId: string, output: { name: string; url?: string; isFinal?: boolean }): Promise<EditResult> {
  return guard(z.object({ id, o: outputInput }), { id: nodeId, o: output }, (v) => run((c) => edit.addOutput(c, v.id, v.o)));
}
export async function updateOutputAction(outputId: string, output: { name: string; url?: string; isFinal?: boolean }): Promise<EditResult> {
  return guard(z.object({ id, o: outputInput }), { id: outputId, o: output }, (v) => run((c) => edit.updateOutput(c, v.id, v.o)));
}
export async function removeOutputAction(outputId: string): Promise<EditResult> {
  return guard(id, outputId, (v) => run((c) => edit.removeOutput(c, v)));
}

// ───── 합치기·쪼개기 ─────
export async function mergeActivitiesAction(keepId: string, otherId: string): Promise<EditResult> {
  return guard(z.object({ k: id, o: id }), { k: keepId, o: otherId }, (v) => run((c) => edit.mergeActivities(c, v.k, v.o)));
}
export async function splitActivityAction(nodeId: string, name: string, fields: string[], children: string[]): Promise<EditResult> {
  return guard(z.object({ id, n: z.string().max(300), f: z.array(z.string().max(40)).max(10), c: z.array(id).max(100) }), { id: nodeId, n: name, f: fields, c: children }, (v) => run((c) => edit.splitActivity(c, v.id, v.n, v.f, v.c)));
}
