// Design Ref: DESIGN.md §14.5, PRD 5번 — 내가 직접 노드·활동 카드를 고치는 저장소 쪽 일. 로그인한 사람의 연결로 쓰므로 "내 행만" 규칙이 걸린다.
// 값 검사는 lib/rules/nodes.ts가 하고, 여기서는 현재 상태를 읽어 규칙에 넘긴 뒤 저장한다.
// 내가 고친 필드는 잠근다(잠금은 AI 기록이 덮어쓰지 않게 하는 표시다). 예상된 실패는 {ok:false, message}로 돌려주고, 저장소 오류는 던진다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError } from "../mcp/errors";
import { EVIDENCE_LIMITS, FILE_LIMITS, NODE_LIMITS, STAR_LIMITS } from "../rules/limits";
import { snoozeUntil } from "../rules/results";
import { canBeChild, checkAddNode, checkEvidence, checkField, checkMoveNode, checkNodeInput, hasStar, mergeField, STAR_FIELD_LABEL, STAR_FIELDS, type NodeKind, type NodeLockable, type PortfolioStatus, type StarField } from "../rules/nodes";

export type EditResult = { ok: true; message?: string; id?: string; storagePath?: string | null } | { ok: false; message: string };
const fail = (message: string): EditResult => ({ ok: false, message });
const NOT_FOUND = fail("대상을 찾을 수 없습니다.");

type Row = { id: string; parent_id: string | null; kind: NodeKind; name: string; description: string; start_date: string | null; end_date: string | null; portfolio_status: PortfolioStatus; locked_fields: NodeLockable[]; deleted_at: string | null };

async function loadRows(client: SupabaseClient): Promise<Row[]> {
  const { data, error } = await client.from("nodes").select("id, parent_id, kind, name, description, start_date, end_date, portfolio_status, locked_fields, deleted_at");
  if (error) throw new StoreError("노드 읽기", error.code);
  return (data ?? []) as Row[];
}
const refs = (rows: Row[]) => rows.map((r) => ({ id: r.id, parentId: r.parent_id, kind: r.kind, portfolioStatus: r.portfolio_status, deletedAt: r.deleted_at }));
const check = (error: { code?: string } | null, what: string) => {
  if (error) throw new StoreError(what, error.code);
};

// ───────── 노드 ─────────

export async function createNode(client: SupabaseClient, input: { parentId: string | null; kind: unknown; name: unknown; description?: unknown; startDate?: unknown; endDate?: unknown }): Promise<EditResult> {
  const checked = checkNodeInput({ kind: input.kind, name: input.name, description: input.description, startDate: input.startDate ?? null, endDate: input.endDate ?? null });
  if (!checked.ok) return fail(checked.message);
  const rows = await loadRows(client);
  const placed = checkAddNode(refs(rows), input.parentId, checked.value.kind);
  if (!placed.ok) return fail(placed.message);
  const v = checked.value;
  const { data, error } = await client
    .from("nodes")
    .insert({ parent_id: input.parentId, kind: v.kind, name: v.name, description: v.description, start_date: v.startDate, end_date: v.endDate, created_by: "user" })
    .select("id")
    .single();
  check(error, "노드 만들기");
  return { ok: true, id: data!.id };
}

export type NodePatch = { name?: unknown; kind?: unknown; description?: unknown; startDate?: unknown; endDate?: unknown; portfolioStatus?: unknown };

/** 고친 필드는 잠금 목록에 더한다. 바뀐 것이 없으면 아무것도 하지 않는다. */
export async function updateNode(client: SupabaseClient, id: string, patch: NodePatch): Promise<EditResult> {
  const rows = await loadRows(client);
  const node = rows.find((r) => r.id === id && !r.deleted_at);
  if (!node) return NOT_FOUND;
  const next = {
    kind: "kind" in patch ? patch.kind : node.kind,
    name: "name" in patch ? patch.name : node.name,
    description: "description" in patch ? patch.description : node.description,
    startDate: "startDate" in patch ? (patch.startDate === "" ? null : patch.startDate) : node.start_date,
    endDate: "endDate" in patch ? (patch.endDate === "" ? null : patch.endDate) : node.end_date,
    portfolioStatus: "portfolioStatus" in patch ? patch.portfolioStatus : node.portfolio_status,
  };
  const checked = checkNodeInput(next);
  if (!checked.ok) return fail(checked.message);
  const v = checked.value;

  if (v.kind !== node.kind) {
    const parent = rows.find((r) => r.id === node.parent_id);
    if (!canBeChild(parent?.kind ?? null, v.kind)) return fail("이 위치에는 그 종류를 둘 수 없습니다.");
    if (rows.some((r) => r.parent_id === id && !r.deleted_at && !canBeChild(v.kind, r.kind))) return fail("아래에 있는 노드를 품을 수 없는 종류입니다. 먼저 아래 노드를 옮겨 주세요.");
    if (!hasStar(v.kind)) {
      const { count, error } = await client.from("node_fields").select("field", { count: "exact", head: true }).eq("node_id", id);
      check(error, "항목 읽기");
      if ((count ?? 0) > 0) return fail("STAR 항목이 있어 이 종류로 바꿀 수 없습니다.");
    }
  }

  const locks = new Set<NodeLockable>(node.locked_fields);
  if (v.name !== node.name) locks.add("name");
  if (v.kind !== node.kind) locks.add("kind");
  if (v.description !== node.description) locks.add("description");
  if (v.startDate !== node.start_date || v.endDate !== node.end_date) locks.add("period");
  if (v.portfolioStatus !== node.portfolio_status) locks.add("portfolio_status");
  if (locks.size === node.locked_fields.length && v.name === node.name && v.kind === node.kind && v.description === node.description && v.startDate === node.start_date && v.endDate === node.end_date && v.portfolioStatus === node.portfolio_status) return { ok: true };

  const { error } = await client
    .from("nodes")
    .update({ kind: v.kind, name: v.name, description: v.description, start_date: v.startDate, end_date: v.endDate, portfolio_status: v.portfolioStatus, locked_fields: [...locks] })
    .eq("id", id);
  check(error, "노드 수정");
  return { ok: true };
}

export async function moveNode(client: SupabaseClient, id: string, newParentId: string | null): Promise<EditResult> {
  const rows = await loadRows(client);
  const node = rows.find((r) => r.id === id && !r.deleted_at);
  if (!node) return NOT_FOUND;
  if (newParentId === node.parent_id) return { ok: true };
  const checked = checkMoveNode(refs(rows), id, newParentId);
  if (!checked.ok) return fail(checked.message);
  const locks = [...new Set<NodeLockable>([...node.locked_fields, "parent"])];
  const { error } = await client.from("nodes").update({ parent_id: newParentId, locked_fields: locks }).eq("id", id);
  if (error) {
    if (/node_cycle|node_too_deep/.test((error as { message?: string }).message ?? "")) return fail("그 위치로는 옮길 수 없습니다.");
    check(error, "노드 이동");
  }
  return { ok: true };
}

/** 노드의 잠금을 푼다(그 필드는 다시 AI 기록이 고칠 수 있다) */
export async function unlockNodeField(client: SupabaseClient, id: string, which: NodeLockable): Promise<EditResult> {
  const { data, error } = await client.from("nodes").select("locked_fields").eq("id", id).maybeSingle();
  check(error, "노드 읽기");
  if (!data) return NOT_FOUND;
  const { error: e2 } = await client.from("nodes").update({ locked_fields: (data.locked_fields as NodeLockable[]).filter((f) => f !== which) }).eq("id", id);
  check(e2, "잠금 풀기");
  return { ok: true };
}

// ───────── 휴지통 ─────────

export async function trashNode(client: SupabaseClient, id: string): Promise<EditResult> {
  const { data, error } = await client.rpc("trash_node", { p_id: id });
  if (error) {
    if (/node_not_found/.test(error.message)) return NOT_FOUND;
    throw new StoreError("휴지통으로 보내기", error.code);
  }
  return { ok: true, message: typeof data === "number" && data > 1 ? `아래 노드를 포함해 ${data}개를 휴지통으로 보냈습니다.` : undefined };
}

export async function restoreNode(client: SupabaseClient, id: string): Promise<EditResult> {
  const { error } = await client.rpc("restore_node", { p_id: id });
  if (error) {
    if (/parent_trashed/.test(error.message)) return fail("상위 노드가 휴지통에 있습니다. 상위 노드를 먼저 복구해 주세요.");
    if (/node_not_found/.test(error.message)) return NOT_FOUND;
    throw new StoreError("복구", error.code);
  }
  return { ok: true };
}

/** 휴지통에 있는 노드만 완전히 지운다(아래 가지·항목·근거도 함께 사라지고, 산출물에 붙은 첨부 파일도 Storage에서 지운다) */
export async function purgeNode(client: SupabaseClient, id: string): Promise<EditResult> {
  const rows = await loadRows(client);
  const target = rows.find((r) => r.id === id);
  if (!target || !target.deleted_at) return NOT_FOUND;
  const below = new Set<string>([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) if (r.parent_id && below.has(r.parent_id) && !below.has(r.id)) { below.add(r.id); grew = true; }
  }
  const files = await client.from("outputs").select("storage_path").in("node_id", [...below]).not("storage_path", "is", null);
  check(files.error, "첨부 파일 읽기");
  const { data, error } = await client.from("nodes").delete().eq("id", id).not("deleted_at", "is", null).select("id");
  check(error, "완전히 지우기");
  if ((data?.length ?? 0) === 0) return NOT_FOUND;
  const paths = (files.data ?? []).map((f) => f.storage_path as string);
  if (paths.length > 0) {
    const removed = await client.storage.from("trail-files").remove(paths);
    if (removed.error) console.error("[my] 첨부 파일 정리 실패", paths.length);
  }
  return { ok: true };
}

// ───────── STAR 항목 ─────────

async function starNode(client: SupabaseClient, nodeId: string): Promise<Row | null> {
  const rows = await loadRows(client);
  const node = rows.find((r) => r.id === nodeId && !r.deleted_at);
  return node && hasStar(node.kind) ? node : null;
}

/** 내가 항목을 쓴다(근거 없이도 된다). 내용이 비면 항목과 그 근거를 지운다. 쓰면 그 항목은 잠긴다. */
export async function setFieldText(client: SupabaseClient, nodeId: string, field: unknown, text: unknown, subject: unknown): Promise<EditResult> {
  const checked = checkField({ field, text, subject: subject ?? "did" }, "user");
  if (!checked.ok) return fail(checked.message);
  if (!(await starNode(client, nodeId))) return fail("활동이나 세부활동에만 항목을 쓸 수 있습니다.");
  const v = checked.value;
  if ("empty" in v) {
    const del = await client.from("node_fields").delete().eq("node_id", nodeId).eq("field", v.field);
    check(del.error, "항목 지우기");
    const ev = await client.from("evidence").delete().eq("node_id", nodeId).eq("field", v.field);
    check(ev.error, "근거 지우기");
    await setCleared(client, nodeId, v.field, true);
    if (v.field === "result_external") await syncResultState(client, nodeId);
    return { ok: true };
  }
  const { error } = await client.from("node_fields").upsert({ node_id: nodeId, field: v.field, text: v.text, subject: v.subject, locked: true, updated_by: "user", updated_at: new Date().toISOString() }, { onConflict: "node_id,field" });
  check(error, "항목 저장");
  await setCleared(client, nodeId, v.field, false);
  if (v.field === "result_external") await syncResultState(client, nodeId);
  return { ok: true };
}

/** 내가 비운 항목 표시(cleared_fields)를 켜거나 끈다. 비운 항목은 AI 기록이 다시 채우지 않는다. */
async function setCleared(client: SupabaseClient, nodeId: string, field: StarField, cleared: boolean): Promise<void> {
  const { data, error } = await client.from("nodes").select("cleared_fields").eq("id", nodeId).maybeSingle();
  check(error, "노드 읽기");
  const now = new Set<string>((data?.cleared_fields as string[] | undefined) ?? []);
  if (now.has(field) === cleared) return;
  if (cleared) now.add(field);
  else now.delete(field);
  const upd = await client.from("nodes").update({ cleared_fields: [...now] }).eq("id", nodeId);
  check(upd.error, "비움 표시 저장");
}

export async function setFieldSubject(client: SupabaseClient, nodeId: string, field: unknown, subject: unknown): Promise<EditResult> {
  if (!STAR_FIELDS.includes(field as StarField)) return fail("항목 이름이 올바르지 않습니다.");
  const { data, error } = await client.from("node_fields").select("text").eq("node_id", nodeId).eq("field", field).maybeSingle();
  check(error, "항목 읽기");
  if (!data) return fail("내용이 있는 항목만 주체를 바꿀 수 있습니다.");
  return setFieldText(client, nodeId, field, data.text, subject);
}

export async function setFieldLock(client: SupabaseClient, nodeId: string, field: unknown, locked: boolean): Promise<EditResult> {
  if (!STAR_FIELDS.includes(field as StarField)) return fail("항목 이름이 올바르지 않습니다.");
  const { data, error } = await client.from("node_fields").update({ locked }).eq("node_id", nodeId).eq("field", field).select("field");
  check(error, "잠금 바꾸기");
  return (data?.length ?? 0) > 0 ? { ok: true } : NOT_FOUND;
}

// ───────── 근거 ─────────

export async function addEvidence(client: SupabaseClient, nodeId: string, field: unknown, evidence: { conversationTitle: string; conversationDate: string; excerpt: string }): Promise<EditResult> {
  if (!STAR_FIELDS.includes(field as StarField)) return fail("항목 이름이 올바르지 않습니다.");
  const problem = checkEvidence(evidence);
  if (problem) return fail(problem);
  const exists = await client.from("node_fields").select("field").eq("node_id", nodeId).eq("field", field).maybeSingle();
  check(exists.error, "항목 읽기");
  if (!exists.data) return fail("내용이 있는 항목에만 근거를 붙일 수 있습니다.");
  const { error } = await client.from("evidence").insert({ node_id: nodeId, field, conversation_title: evidence.conversationTitle.trim(), conversation_date: evidence.conversationDate, excerpt: evidence.excerpt.trim() });
  if (error) {
    if ((error as { message?: string }).message?.includes("evidence_limit")) return fail("근거는 항목당 3개까지입니다.");
    check(error, "근거 저장");
  }
  return { ok: true };
}

export async function updateEvidence(client: SupabaseClient, id: string, evidence: { conversationTitle: string; conversationDate: string; excerpt: string }): Promise<EditResult> {
  const problem = checkEvidence(evidence);
  if (problem) return fail(problem);
  const { data, error } = await client.from("evidence").update({ conversation_title: evidence.conversationTitle.trim(), conversation_date: evidence.conversationDate, excerpt: evidence.excerpt.trim() }).eq("id", id).select("id");
  check(error, "근거 수정");
  return (data?.length ?? 0) > 0 ? { ok: true } : NOT_FOUND;
}

export async function removeEvidence(client: SupabaseClient, id: string): Promise<EditResult> {
  const { error } = await client.from("evidence").delete().eq("id", id);
  check(error, "근거 지우기");
  return { ok: true };
}

// ───────── 필드 제안 ─────────

/** 제안 처리: 덧붙이기(append)·바꾸기(replace)는 내 수정이라 항목이 잠기고, 거절(reject)은 제안만 닫는다. */
export async function resolveSuggestion(client: SupabaseClient, id: string, mode: "append" | "replace" | "reject"): Promise<EditResult> {
  const { data: s, error } = await client.from("field_suggestions").select("id, node_id, field, text, subject, evidence, status").eq("id", id).maybeSingle();
  check(error, "제안 읽기");
  if (!s || s.status !== "proposed") return NOT_FOUND;
  const field = s.field as StarField;
  if (mode !== "reject") {
    const cur = await client.from("node_fields").select("text, locked").eq("node_id", s.node_id).eq("field", field).maybeSingle();
    check(cur.error, "항목 읽기");
    let text = s.text as string;
    if (mode === "append" && cur.data) {
      const merged = mergeField({ text: cur.data.text, locked: false }, s.text, field);
      if (merged.action === "suggest") return fail(`덧붙이면 ${STAR_FIELD_LABEL[field]} 한도(${STAR_LIMITS[field]}자)를 넘습니다. 바꾸기를 쓰거나 먼저 줄여 주세요.`);
      if (merged.action === "skip") text = cur.data.text;
      else if (merged.action === "append" || merged.action === "set") text = merged.text;
    }
    const saved = await setFieldText(client, s.node_id, field, text, s.subject);
    if (!saved.ok) return saved;
    // 제안에 딸린 근거를 가능한 만큼 붙인다
    const have = await client.from("evidence").select("id", { count: "exact", head: true }).eq("node_id", s.node_id).eq("field", field);
    check(have.error, "근거 세기");
    const room = Math.max(0, EVIDENCE_LIMITS.maxPerField - (have.count ?? 0));
    const list = (Array.isArray(s.evidence) ? s.evidence : []).slice(0, room) as { conversationTitle: string; conversationDate: string; excerpt: string }[];
    for (const e of list) await addEvidence(client, s.node_id, field, e);
  }
  const done = await client.from("field_suggestions").update({ status: mode === "reject" ? "rejected" : "accepted", resolved_at: new Date().toISOString() }).eq("id", id);
  check(done.error, "제안 닫기");
  return { ok: true };
}

// ───────── 산출물 ─────────

const urlOk = (url: string) => /^https?:\/\/\S+$/i.test(url) && url.length <= NODE_LIMITS.urlMaxChars;

/** 첨부 파일 경로는 "<내 id>/<노드 id>/<파일>" 모양이어야 한다(다른 사람·다른 노드의 파일을 가리키지 못하게 한다) */
const pathOk = (path: string, userId: string, nodeId: string) => path.length <= FILE_LIMITS.pathMaxChars && path.startsWith(`${userId}/${nodeId}/`) && !path.slice(userId.length + nodeId.length + 2).includes("/") && !path.includes("..");

type OutputInput = { name: string; url?: string; isFinal?: boolean; storagePath?: string };

export async function addOutput(client: SupabaseClient, nodeId: string, input: OutputInput, userId?: string): Promise<EditResult> {
  const name = (input.name ?? "").trim();
  const url = input.url?.trim() ? input.url.trim() : null;
  const storagePath = input.storagePath?.trim() ? input.storagePath.trim() : null;
  if (name === "" || name.length > NODE_LIMITS.outputNameMaxChars) return fail(`산출물 이름은 1~${NODE_LIMITS.outputNameMaxChars}자여야 합니다.`);
  if (url !== null && !urlOk(url)) return fail("링크는 http:// 또는 https://로 시작해야 합니다.");
  if (storagePath !== null && (!userId || !pathOk(storagePath, userId, nodeId))) return fail("첨부 파일 경로가 올바르지 않습니다.");
  const { count, error } = await client.from("outputs").select("id", { count: "exact", head: true }).eq("node_id", nodeId);
  check(error, "산출물 세기");
  if ((count ?? 0) >= NODE_LIMITS.outputsMaxCount) return fail(`산출물은 노드당 ${NODE_LIMITS.outputsMaxCount}개까지입니다.`);
  const ins = await client.from("outputs").insert({ node_id: nodeId, name, url, storage_path: storagePath, is_final: input.isFinal === true });
  check(ins.error, "산출물 저장");
  await syncResultState(client, nodeId);
  return { ok: true };
}

export async function updateOutput(client: SupabaseClient, id: string, input: OutputInput): Promise<EditResult> {
  const name = (input.name ?? "").trim();
  const url = input.url?.trim() ? input.url.trim() : null;
  if (name === "" || name.length > NODE_LIMITS.outputNameMaxChars) return fail(`산출물 이름은 1~${NODE_LIMITS.outputNameMaxChars}자여야 합니다.`);
  if (url !== null && !urlOk(url)) return fail("링크는 http:// 또는 https://로 시작해야 합니다.");
  const { data, error } = await client.from("outputs").update({ name, url, is_final: input.isFinal === true }).eq("id", id).select("id, node_id");
  check(error, "산출물 수정");
  if ((data?.length ?? 0) === 0) return NOT_FOUND;
  await syncResultState(client, data![0].node_id as string);
  return { ok: true };
}

/** 지운 산출물의 첨부 파일 경로를 돌려준다(화면이 Storage에서 파일도 지운다) */
export async function removeOutput(client: SupabaseClient, id: string): Promise<EditResult> {
  const found = await client.from("outputs").select("node_id, storage_path").eq("id", id).maybeSingle();
  check(found.error, "산출물 읽기");
  if (!found.data) return NOT_FOUND;
  const { error } = await client.from("outputs").delete().eq("id", id);
  check(error, "산출물 지우기");
  await syncResultState(client, found.data.node_id as string);
  return { ok: true, storagePath: (found.data.storage_path as string | null) ?? null };
}

// ───────── 결과 상태(결과 등록 대기) ─────────

/** 결과가 채워졌으면(외부 결과 글 또는 최종 산출물) 상태를 채워짐으로, 비워졌으면 채워짐을 비어 있음으로 되돌린다. 숨김·해당 없음은 건드리지 않는다. */
async function syncResultState(client: SupabaseClient, nodeId: string): Promise<void> {
  const [field, finals, node] = await Promise.all([
    client.from("node_fields").select("text").eq("node_id", nodeId).eq("field", "result_external").maybeSingle(),
    client.from("outputs").select("id", { count: "exact", head: true }).eq("node_id", nodeId).eq("is_final", true),
    client.from("nodes").select("result_state").eq("id", nodeId).maybeSingle(),
  ]);
  check(field.error, "결과 읽기");
  check(finals.error, "산출물 읽기");
  check(node.error, "노드 읽기");
  if (!node.data) return;
  const filled = (field.data?.text ?? "").trim() !== "" || (finals.count ?? 0) > 0;
  const state = node.data.result_state as string;
  const next = filled ? "filled" : state === "filled" ? "empty" : state;
  if (next === state) return;
  const { error } = await client.from("nodes").update({ result_state: next, result_snooze_until: null }).eq("id", nodeId);
  check(error, "결과 상태 저장");
}

/** "나중에"(숨김 기간 동안 숨김), "해당 없음", 되돌리기. 결과가 이미 채워진 활동은 상태를 바꾸지 않는다. */
export async function setResultState(client: SupabaseClient, nodeId: string, mode: "snooze" | "not_applicable" | "reset", snoozeDays: number, now: Date = new Date()): Promise<EditResult> {
  const found = await client.from("nodes").select("result_state, kind").eq("id", nodeId).is("deleted_at", null).maybeSingle();
  check(found.error, "노드 읽기");
  if (!found.data) return NOT_FOUND;
  if (found.data.result_state === "filled") return fail("결과가 이미 입력돼 있습니다.");
  const patch = mode === "snooze" ? { result_state: "snoozed", result_snooze_until: snoozeUntil(now, snoozeDays) } : mode === "not_applicable" ? { result_state: "not_applicable", result_snooze_until: null } : { result_state: "empty", result_snooze_until: null };
  const { error } = await client.from("nodes").update(patch).eq("id", nodeId);
  check(error, "결과 상태 저장");
  return { ok: true };
}

// ───────── 합치기·쪼개기 ─────────

export async function mergeActivities(client: SupabaseClient, keepId: string, otherId: string): Promise<EditResult> {
  const { error } = await client.rpc("merge_activities", { p_keep: keepId, p_other: otherId });
  if (error) {
    const m = error.message ?? "";
    const tooLong = /too_long:(\w+)/.exec(m);
    if (tooLong) return fail(`합치면 ${STAR_FIELD_LABEL[tooLong[1] as StarField] ?? "항목"}이(가) 한도를 넘습니다. 먼저 줄여 주세요.`);
    if (/too_many_outputs/.test(m)) return fail(`합치면 산출물이 ${NODE_LIMITS.outputsMaxCount}개를 넘습니다.`);
    if (/related_nodes/.test(m)) return fail("서로 위아래 관계인 노드는 합칠 수 없습니다.");
    if (/kind_mismatch/.test(m)) return fail("같은 종류의 활동끼리만 합칠 수 있습니다.");
    if (/node_not_found|same_node/.test(m)) return NOT_FOUND;
    throw new StoreError("합치기", error.code);
  }
  await syncResultState(client, keepId); // 외부 결과·최종 산출물이 옮겨졌을 수 있다
  return { ok: true, message: "합쳤습니다. 합친 쪽은 휴지통에 있습니다." };
}

export async function splitActivity(client: SupabaseClient, id: string, name: unknown, fields: unknown, children: unknown): Promise<EditResult> {
  const checked = checkNodeInput({ kind: "activity", name });
  if (!checked.ok) return fail(checked.message);
  const fieldList = Array.isArray(fields) ? fields.filter((f): f is StarField => STAR_FIELDS.includes(f as StarField)) : [];
  const childList = Array.isArray(children) ? children.filter((c): c is string => typeof c === "string") : [];
  const { data, error } = await client.rpc("split_activity", { p_id: id, p_name: checked.value.name, p_fields: fieldList, p_children: childList });
  if (error) {
    if (/nothing_to_move/.test(error.message)) return fail("옮길 항목이나 세부활동을 하나 이상 골라 주세요.");
    if (/node_not_found/.test(error.message)) return NOT_FOUND;
    throw new StoreError("쪼개기", error.code);
  }
  // 외부 결과·최종 산출물은 항목·산출물 쪽에서 옮겨 가므로 결과 상태를 두 활동 모두 다시 맞춘다(산출물은 원래 활동에 남는다)
  await syncResultState(client, id);
  await syncResultState(client, data as string);
  return { ok: true, id: data as string, message: "새 활동으로 쪼갰습니다." };
}
