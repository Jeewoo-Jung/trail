// Design Ref: DESIGN.md §14.5, PRD 5번 — 상향식 묶기: 같은 부모 아래 같은 종류의 노드가 쌓이면 새 상위 노드 후보를 "한 단계씩" 제안한다.
// 이 파일은 순수 규칙만 둔다: 어떤 노드들이 후보인지, Claude의 답이 규칙에 맞는지, 승인해도 되는지.
// 시드 범주가 없어도 동작한다(부모가 없는 맨 위 노드끼리도 묶는다). 승인한 것만 반영하고, 거절한 제안은 같은 묶음으로 다시 만들지 않는다.
import { GROUP_LIMITS } from "./limits";
import { canBeChild, checkNodeInput, isEffectivelyExcluded, type NodeKind, type NodeRef } from "./nodes";
import { normalizeTopic } from "./topic";

export type GroupableNode = NodeRef & { name: string; description: string };
export type GroupKind = "category" | "project";

/** 묶을 수 있는 종류와, 묶었을 때 새로 만들 상위 노드 종류. 한 번에 한 단계만 올라간다. */
export function groupKindFor(childKind: NodeKind): GroupKind | null {
  if (childKind === "activity") return "project";
  if (childKind === "project" || childKind === "category") return "category";
  return null; // 세부활동·학습은 묶지 않는다
}

export const signatureOf = (childIds: readonly string[]): string => [...childIds].sort().join("|");

export type Bucket = { parentId: string | null; kind: NodeKind; groupKind: GroupKind; nodes: GroupableNode[] };

/**
 * 묶음 후보: (부모, 종류)가 같은 형제가 minSiblings개 이상인 곳. 휴지통·제외 노드와,
 * 이미 처리 대기 중인 제안에 들어 있는 노드는 뺀다. 오래 쌓인 곳(노드가 많은 곳)부터 돌려준다.
 */
export function groupingBuckets(nodes: readonly GroupableNode[], pendingChildIds: ReadonlySet<string> = new Set()): Bucket[] {
  const live = nodes.filter((n) => !n.deletedAt && !isEffectivelyExcluded(nodes, n.id) && !pendingChildIds.has(n.id));
  const map = new Map<string, Bucket>();
  for (const n of live) {
    const groupKind = groupKindFor(n.kind);
    if (!groupKind) continue;
    // 새 상위 노드를 부모 아래에 둘 수 있어야 한다(예: 활동을 묶은 프로젝트는 범주·맨 위에는 둘 수 있다)
    const parentKind = n.parentId ? (nodes.find((p) => p.id === n.parentId)?.kind ?? null) : null;
    if (!canBeChild(parentKind, groupKind)) continue;
    const key = `${n.parentId ?? ""}|${n.kind}`;
    const bucket = map.get(key) ?? { parentId: n.parentId, kind: n.kind, groupKind, nodes: [] };
    bucket.nodes.push(n);
    map.set(key, bucket);
  }
  return [...map.values()].filter((b) => b.nodes.length >= GROUP_LIMITS.minSiblings).sort((a, b) => b.nodes.length - a.nodes.length);
}

export type GroupProposalDraft = { childIds: string[]; name: string; kind: GroupKind; signature: string };

/** Claude의 답({groups:[{ids,name}]})을 규칙에 맞는 제안만 골라낸다. 모양이 다르거나 규칙에 어긋나는 항목은 조용히 버린다. */
export function parseGroupAdvice(raw: unknown, bucket: Bucket, knownSignatures: ReadonlySet<string>): GroupProposalDraft[] {
  const groups = typeof raw === "object" && raw !== null && Array.isArray((raw as { groups?: unknown }).groups) ? (raw as { groups: unknown[] }).groups : [];
  const inBucket = new Set(bucket.nodes.map((n) => n.id));
  const used = new Set<string>();
  const out: GroupProposalDraft[] = [];
  for (const g of groups) {
    if (typeof g !== "object" || g === null) continue;
    const { ids, name } = g as { ids?: unknown; name?: unknown };
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) continue;
    const childIds = [...new Set(ids as string[])];
    if (childIds.length < GROUP_LIMITS.minChildren || childIds.length > GROUP_LIMITS.maxChildren) continue;
    if (childIds.some((i) => !inBucket.has(i) || used.has(i))) continue;
    const checked = checkNodeInput({ kind: bucket.groupKind, name });
    if (!checked.ok) continue;
    // 같은 부모 아래에 같은 이름이 이미 있으면 새로 만들지 않는다(중복 방지)
    if (bucket.nodes.some((n) => normalizeTopic(n.name) === normalizeTopic(checked.value.name))) continue;
    const signature = signatureOf(childIds);
    if (knownSignatures.has(signature)) continue;
    childIds.forEach((i) => used.add(i));
    out.push({ childIds, name: checked.value.name, kind: bucket.groupKind, signature });
    if (out.length >= GROUP_LIMITS.maxProposalsPerRun) break;
  }
  return out;
}

export type ApplyCheck = { ok: true; parentId: string | null } | { ok: false; message: string };

/** 승인 직전 검사: 자식들이 아직 같은 부모 아래 같은 종류로 살아 있고, 새 노드를 둘 수 있어야 한다 */
export function checkApplyGroup(nodes: readonly GroupableNode[], childIds: readonly string[], kind: GroupKind): ApplyCheck {
  const kids = childIds.map((id) => nodes.find((n) => n.id === id));
  if (kids.some((k) => !k || k.deletedAt)) return { ok: false, message: "묶으려던 노드가 없어졌거나 휴지통에 있습니다. 제안을 거절하고 새로 받아 주세요." };
  const first = kids[0]!;
  if (kids.some((k) => k!.parentId !== first.parentId || k!.kind !== first.kind)) return { ok: false, message: "묶으려던 노드의 위치나 종류가 바뀌었습니다. 제안을 거절하고 새로 받아 주세요." };
  const parentKind = first.parentId ? (nodes.find((p) => p.id === first.parentId)?.kind ?? null) : null;
  if (!canBeChild(parentKind, kind) || !canBeChild(kind, first.kind)) return { ok: false, message: "이 위치에는 그 묶음을 만들 수 없습니다." };
  return { ok: true, parentId: first.parentId };
}
