// Design Ref: PRD 5번(결과·최종 산출물 등록) — "결과 등록 대기" 판정과 결과 상태. 순수 함수만 둔다.
// 활동의 결과는 "외부 결과"(내가 입력)나 "최종 산출물"(산출물 중 최종 표시)이 하나라도 있으면 채워진 것이다. 기본은 미입력이다.
//  - 앱: 프로젝트(없으면 그 활동 자신)에 대기 일수(설정, 기본 7일)를 넘게 새 기록이 없고 결과가 비어 있으면 대시보드에 "결과 등록 대기"로 보여 준다.
//    항목마다 "나중에"(숨김 기간 동안 숨김)와 "해당 없음"(더는 안 보임)을 고를 수 있다.
//  - Claude 채팅: 결과가 비어 있는 활동을 확인해 활동당 최대 1회, 주제와 관련된 채팅에서만 묻는다(대기 일수와 무관).
import { isEffectivelyExcluded, type NodeKind, type NodeRef } from "./nodes";

const DAY_MS = 86_400_000;

export type ResultNode = NodeRef & {
  name: string;
  updatedAt: string;
  resultState: "empty" | "snoozed" | "not_applicable" | "filled";
  resultSnoozeUntil: string | null;
  resultAskedAt: string | null;
};
export type ResultFieldMark = { nodeId: string; field: string; text: string; updatedAt: string };
export type ResultOutputMark = { nodeId: string; isFinal: boolean };

/** 결과가 채워진 활동 id들: 외부 결과 글이 있거나, 최종으로 표시한 산출물이 있다 */
export function filledResultIds(fields: readonly ResultFieldMark[], outputs: readonly ResultOutputMark[]): Set<string> {
  const ids = new Set<string>();
  for (const f of fields) if (f.field === "result_external" && f.text.trim() !== "") ids.add(f.nodeId);
  for (const o of outputs) if (o.isFinal) ids.add(o.nodeId);
  return ids;
}

/** 결과를 묻거나 기다릴 수 있는 노드: 휴지통·제외가 아닌 활동. 세부활동은 활동에 속하므로 따로 세지 않는다. */
const isResultSubject = (nodes: readonly ResultNode[], n: ResultNode): boolean => n.kind === ("activity" satisfies NodeKind) && !n.deletedAt && !isEffectivelyExcluded(nodes, n.id);

/** 숨김(나중에)이 지금도 유효한지, 또는 해당 없음인지 */
export function isHidden(n: ResultNode, nowMs: number): boolean {
  if (n.resultState === "not_applicable") return true;
  return n.resultState === "snoozed" && n.resultSnoozeUntil !== null && Date.parse(n.resultSnoozeUntil) > nowMs;
}

/** 가장 가까운 프로젝트 조상(없으면 자기 자신)의 id: "새 기록이 없다"를 재는 단위 */
export function groupRootId(nodes: readonly ResultNode[], id: string): string {
  const map = new Map(nodes.map((n) => [n.id, n]));
  for (let cur = map.get(id), guard = 0; cur && guard < 12; cur = cur.parentId ? map.get(cur.parentId) : undefined, guard += 1) {
    if (cur.kind === "project") return cur.id;
  }
  return id;
}

/** 어떤 노드 아래(포함)에서 가장 최근에 고쳐지거나 기록된 시각(ms) */
export function lastRecordMs(nodes: readonly ResultNode[], fields: readonly ResultFieldMark[], rootId: string): number {
  const below = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) if (n.parentId && below.has(n.parentId) && !below.has(n.id)) { below.add(n.id); grew = true; }
  }
  let last = 0;
  for (const n of nodes) if (below.has(n.id)) last = Math.max(last, Date.parse(n.updatedAt) || 0);
  for (const f of fields) if (below.has(f.nodeId)) last = Math.max(last, Date.parse(f.updatedAt) || 0);
  return last;
}

export type PendingResult = { nodeId: string; lastRecordAt: string; daysSince: number };

/** 앱의 "결과 등록 대기" 목록: 결과가 비었고, 숨김이 아니며, 프로젝트에 waitDays를 넘게 새 기록이 없는 활동. 오래된 것부터. */
export function pendingResults(input: { nodes: readonly ResultNode[]; fields: readonly ResultFieldMark[]; outputs: readonly ResultOutputMark[]; now: Date; waitDays: number }): PendingResult[] {
  const nowMs = input.now.getTime();
  const filled = filledResultIds(input.fields, input.outputs);
  const lastByGroup = new Map<string, number>();
  const out: PendingResult[] = [];
  for (const n of input.nodes) {
    if (!isResultSubject(input.nodes, n) || filled.has(n.id) || isHidden(n, nowMs)) continue;
    const root = groupRootId(input.nodes, n.id);
    if (!lastByGroup.has(root)) lastByGroup.set(root, lastRecordMs(input.nodes, input.fields, root));
    const last = lastByGroup.get(root)!;
    const days = Math.floor((nowMs - last) / DAY_MS);
    if (days > input.waitDays) out.push({ nodeId: n.id, lastRecordAt: new Date(last).toISOString(), daysSince: days });
  }
  return out.sort((a, b) => b.daysSince - a.daysSince);
}

export type ChatPendingResult = { nodeId: string; askedBefore: boolean };

/** Claude 채팅용: 결과가 비어 있고 숨김이 아닌 활동. 이미 물은 활동은 askedBefore로 표시한다(활동당 1회). */
export function chatPendingResults(input: { nodes: readonly ResultNode[]; filledIds: ReadonlySet<string>; now: Date }): ChatPendingResult[] {
  const nowMs = input.now.getTime();
  return input.nodes.filter((n) => isResultSubject(input.nodes, n) && !input.filledIds.has(n.id) && !isHidden(n, nowMs)).map((n) => ({ nodeId: n.id, askedBefore: n.resultAskedAt !== null }));
}

/** 숨김 기간이 끝나는 시각 */
export const snoozeUntil = (now: Date, snoozeDays: number): string => new Date(now.getTime() + snoozeDays * DAY_MS).toISOString();
