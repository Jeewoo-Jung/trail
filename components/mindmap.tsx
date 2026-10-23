"use client";

// Design Ref: PRD 5 should(마인드맵) — 읽기 전용. 노드를 누르면 트리 화면과 같은 카드 상세를 보여 준다. 승인·거절·삭제는 트리 화면에서만 한다.
import { useMemo, useState } from "react";
import { CardItem } from "@/components/concept-tree";
import { defaultCollapsed, layoutMindmap, MAP_SIZE, NODE_RADIUS, nodeId, type MindNode } from "@/lib/rules/mindmap";
import { cardsOfNode, type TopNode } from "@/lib/rules/tree";

const short = (label: string) => (Array.from(label).length > 7 ? `${Array.from(label).slice(0, 6).join("")}…` : label);

export function Mindmap({ tree }: { tree: TopNode[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => defaultCollapsed(tree));
  const layout = useMemo(() => layoutMindmap(tree, collapsed), [tree, collapsed]);
  const byId = new Map(layout.nodes.map((n) => [nodeId(n), n]));
  const cards = cardsOfNode(tree, selected);
  const selectedTop = tree.find((t) => t.key === selected && t.id !== null && t.subs.length > 0);
  const label = selected === null ? "전체" : (layout.nodes.find((n) => n.key === selected)?.label ?? "선택한 개념");

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="overflow-x-auto rounded-lg border border-black/15 dark:border-white/20">
      <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} role="group" aria-label="개념 마인드맵" className="min-w-[640px] w-full">
        {layout.edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          return <line key={`${e.from}>${e.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-zinc-400" strokeWidth={2} />;
        })}
        {layout.nodes.map((n) => (
          <Dot key={nodeId(n)} node={n} active={selected === n.key} onSelect={() => setSelected(n.key)} />
        ))}
      </svg>
      </div>

      <section aria-label="선택한 개념의 카드" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{label}</h2>
          {selectedTop && (
            <button type="button" onClick={() => toggle(selectedTop.key)} className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20">
              {collapsed.has(selectedTop.key) ? "하위 개념 펼치기" : "하위 개념 접기"}
            </button>
          )}
        </div>
        {cards.length === 0 ? <p className="text-sm text-zinc-500">이 개념에는 카드가 없습니다.</p> : cards.map((card) => <CardItem key={card.id} card={card} />)}
      </section>
    </div>
  );
}

function Dot({ node, active, onSelect }: { node: MindNode; active: boolean; onSelect: () => void }) {
  const r = NODE_RADIUS[node.kind];
  const fill = node.kind === "root" ? "fill-zinc-800 dark:fill-zinc-200" : node.kind === "top" ? "fill-sky-600" : node.proposed ? "fill-amber-500" : "fill-emerald-600";
  const text = node.kind === "root" ? "fill-white dark:fill-black" : "fill-white";
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${node.label} ${node.count}장${node.proposed ? " (제안)" : ""}${node.hidden ? ` 하위 ${node.hidden}개 접힘` : ""}`}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-black dark:focus-visible:[&>circle]:stroke-white"
    >
      <circle cx={node.x} cy={node.y} r={r} className={fill} stroke={active ? "currentColor" : "none"} strokeWidth={active ? 5 : 0} />
      <text x={node.x} y={node.y - 3} textAnchor="middle" fontSize={node.kind === "sub" ? 18 : 20} fontWeight={600} className={text}>
        {short(node.label)}
      </text>
      <text x={node.x} y={node.y + 17} textAnchor="middle" fontSize={16} className={text}>
        {node.count}장{node.hidden ? ` · +${node.hidden}` : ""}
      </text>
    </g>
  );
}
