"use client";

// 기본 화면: 왼쪽 노드 트리(접고 펼치기, 종류·상태·제안 표시), 오른쪽 선택한 노드의 상세·편집, 아래 휴지통.
// actions가 없으면 읽기 전용(로그인 전 샘플)이다.
import { ChevronDown, ChevronRight, Lock, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { NodeDetail } from "@/components/node-detail";
import type { NodeActions } from "@/components/node-actions";
import { Message, useAction } from "@/components/use-action";
import { Badge, buttonClass, EmptyState } from "@/components/ui";
import { NODE_LIMITS } from "@/lib/rules/limits";
import { buildNodeTree, childKindsFor, flatten, trashedRoots, type NodeData, type NodeRow, type TreeNode } from "@/lib/rules/node-tree";
import { NODE_KIND_LABEL, PORTFOLIO_LABEL, type NodeKind } from "@/lib/rules/nodes";

export function NodeTreeView({ data, actions, aiEnabled = false }: { data: NodeData; actions?: NodeActions; /** Claude API 키가 있어 묶기 제안을 만들 수 있는지 */ aiEnabled?: boolean }) {
  const tree = useMemo(() => buildNodeTree(data), [data]);
  const trashed = useMemo(() => trashedRoots(data.nodes), [data.nodes]);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [showTrash, setShowTrash] = useState(false);
  const node = selected ? tree.byId.get(selected) : undefined;
  const total = flatten(tree.roots).length;

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const branch = (n: TreeNode): React.ReactNode => {
    const foldable = n.children.length > 0;
    const open = !collapsed.has(n.id);
    return (
      <div key={n.id} className="flex flex-col">
        <div className={`flex items-center rounded-xl ${selected === n.id ? "bg-surface-active" : "hover:bg-surface-hover"} ${n.effectiveExcluded ? "opacity-60" : ""}`} style={{ marginLeft: `${(n.depth - 1) * 14}px` }}>
          {foldable ? (
            <button type="button" onClick={() => toggle(n.id)} aria-expanded={open} aria-label={`${n.name} ${open ? "접기" : "펼치기"}`} className="w-6 shrink-0 py-1.5 text-subtle">
              {open ? <ChevronDown size={14} strokeWidth={1.5} className="mx-auto" aria-hidden /> : <ChevronRight size={14} strokeWidth={1.5} className="mx-auto" aria-hidden />}
            </button>
          ) : (
            <span className="w-6 shrink-0" aria-hidden />
          )}
          <button type="button" onClick={() => setSelected(n.id)} aria-current={selected === n.id ? "true" : undefined} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 pr-2 text-left">
            <span className="text-[11px] text-subtle">{NODE_KIND_LABEL[n.kind]}</span>
            <span className={`truncate ${n.depth === 1 ? "font-semibold" : ""}`}>{n.name}</span>
            {n.portfolioStatus !== "candidate" && <Badge tone={n.portfolioStatus === "excluded" ? "warn" : "neutral"}>{PORTFOLIO_LABEL[n.portfolioStatus]}</Badge>}
            {n.lockedFields.length > 0 && <Lock size={11} strokeWidth={1.5} className="text-subtle" aria-label="내가 고친 필드가 있음" />}
            {n.pendingSuggestions > 0 && <Badge tone="warn">{`제안 ${n.pendingSuggestions}`}</Badge>}
          </button>
        </div>
        {foldable && open && n.children.map(branch)}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {actions && <GroupPanel data={data} actions={actions} aiEnabled={aiEnabled} onCreated={setSelected} />}
      <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
        <nav aria-label="노드 트리" className="flex flex-col gap-1 text-sm">
          {tree.roots.length === 0 ? <p className="px-2 py-1 text-subtle">노드가 없습니다.</p> : tree.roots.map(branch)}
          {actions && <AddRoot actions={actions} total={data.nodes.length} onCreated={setSelected} />}
        </nav>
        <section aria-label="상세" className="min-w-0">
          {node ? (
            <NodeDetail tree={tree} data={data} node={node} actions={actions} onSelect={setSelected} />
          ) : (
            <EmptyState title={total === 0 ? "아직 기록이 없습니다" : "노드를 골라 보세요"}>
              {total === 0 ? "Claude와 대화하다 기록하면 프로젝트와 활동이 자동으로 만들어져 여기에 나타납니다. 왼쪽 아래에서 직접 추가할 수도 있어요." : "왼쪽에서 프로젝트나 활동을 고르면 STAR 내용과 근거를 보고 바로 고칠 수 있습니다."}
            </EmptyState>
          )}
        </section>
      </div>

      {actions && (
        <section aria-label="휴지통" className="flex flex-col gap-2 border-t border-line pt-4">
          <button type="button" onClick={() => setShowTrash((v) => !v)} aria-expanded={showTrash} className="flex items-center gap-2 self-start text-sm text-muted hover:text-fg">
            <Trash2 size={16} strokeWidth={1.5} aria-hidden />
            휴지통 {trashed.length > 0 ? `(${trashed.length})` : ""}
          </button>
          {showTrash && <Trash roots={trashed} data={data} actions={actions} />}
        </section>
      )}
    </div>
  );
}

/** 상향식 묶기 제안: 같은 위치에 같은 종류의 노드가 쌓이면 새 상위 노드 후보를 한 단계씩 보여 준다. 승인한 것만 반영된다. */
function GroupPanel({ data, actions, aiEnabled, onCreated }: { data: NodeData; actions: NodeActions; aiEnabled: boolean; onCreated: (id: string) => void }) {
  const act = useAction();
  const [names, setNames] = useState<Record<string, string>>({});
  const nameOf = (id: string) => data.nodes.find((n) => n.id === id)?.name ?? "(없어진 노드)";
  return (
    <section aria-label="묶기 제안" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base">묶기 제안 {data.proposals.length > 0 ? data.proposals.length : ""}</h2>
        <button type="button" disabled={!aiEnabled || act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.requestGroups())} title={aiEnabled ? undefined : "Claude API 키가 없어 쓸 수 없습니다"}>
          묶기 제안 받기
        </button>
      </div>
      {!aiEnabled && <p className="text-xs text-warn">Claude API 키가 없어 묶기 제안을 만들 수 없습니다. 나머지 기능은 그대로 쓸 수 있고, 직접 노드를 만들어 옮겨 묶을 수도 있어요.</p>}
      {data.proposals.length === 0 ? (
        <p className="text-muted">같은 위치에 같은 종류의 노드가 4개 이상 쌓이면 &ldquo;묶기 제안 받기&rdquo;로 새 상위 노드 후보를 받아 볼 수 있습니다. 승인하기 전에는 아무것도 바뀌지 않습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.proposals.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <p>
                <Badge tone="info">{`새 ${NODE_KIND_LABEL[p.kind]}`}</Badge> <span className="text-muted">{p.childIds.map(nameOf).join(", ")}</span> 을(를) 묶습니다.
              </p>
              <span className="flex flex-wrap items-center gap-2">
                <input value={names[p.id] ?? p.name} onChange={(e) => setNames((prev) => ({ ...prev, [p.id]: e.target.value }))} aria-label="새 상위 노드 이름" maxLength={NODE_LIMITS.nameMaxChars} className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-1.5" />
                <button type="button" disabled={act.pending} className={buttonClass.primary} onClick={() => act.run(() => actions.approveGroup(p.id, names[p.id] ?? p.name), (r) => { if (r.ok && r.id) onCreated(r.id); })}>승인</button>
                <button type="button" disabled={act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.rejectGroup(p.id))}>거절</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Message message={act.message} />
    </section>
  );
}

function AddRoot({ actions, total, onCreated }: { actions: NodeActions; total: number; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const kinds = childKindsFor(null);
  const [kind, setKind] = useState<NodeKind>("project");
  const [name, setName] = useState("");
  const act = useAction();
  return (
    <div className="mt-2 flex flex-col gap-2">
      {!open ? (
        <button type="button" className={`${buttonClass.secondary} self-start`} onClick={() => setOpen(true)}>맨 위에 노드 추가</button>
      ) : (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); act.run(() => actions.create(null, kind, name), (r) => { setOpen(false); setName(""); if (r.ok && r.id) onCreated(r.id); }); }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as NodeKind)} aria-label="새 노드 종류" className="rounded-xl border border-line bg-surface px-2 py-1.5 text-sm">
            {kinds.map((k) => <option key={k} value={k}>{NODE_KIND_LABEL[k]}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" aria-label="새 노드 이름" maxLength={NODE_LIMITS.nameMaxChars} autoFocus className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm" />
          <button type="submit" disabled={act.pending} className={buttonClass.primary}>추가</button>
          <button type="button" className={buttonClass.secondary} onClick={() => setOpen(false)}>취소</button>
        </form>
      )}
      {total >= NODE_LIMITS.maxTotal * 0.9 && <p className="text-xs text-warn">노드가 {total}개입니다(최대 {NODE_LIMITS.maxTotal}개).</p>}
      <Message message={act.message} />
    </div>
  );
}

function Trash({ roots, data, actions }: { roots: NodeRow[]; data: NodeData; actions: NodeActions }) {
  const act = useAction();
  const countBelow = (id: string, at: string | null): number => data.nodes.filter((n) => n.parentId === id && n.deletedAt === at).reduce((s, n) => s + 1 + countBelow(n.id, at), 0);
  if (roots.length === 0) return <p className="text-sm text-subtle">휴지통이 비어 있습니다.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {roots.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            <span className="text-[11px] text-subtle">{NODE_KIND_LABEL[n.kind]}</span>
            <span>{n.name}</span>
            {countBelow(n.id, n.deletedAt) > 0 && <span className="text-xs text-subtle">아래 {countBelow(n.id, n.deletedAt)}개 포함</span>}
            <span className="ml-auto flex gap-2">
              <button type="button" disabled={act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.restore(n.id))}>복구</button>
              <button type="button" disabled={act.pending} className={buttonClass.danger} onClick={() => { if (window.confirm(`“${n.name}”을(를) 완전히 지울까요? 되돌릴 수 없습니다.`)) act.run(() => actions.purge(n.id)); }}>완전히 지우기</button>
            </span>
          </li>
        ))}
      </ul>
      <Message message={act.message} />
    </div>
  );
}
