"use client";

// Design Ref: DESIGN.md §3.2~3.3 — 왼쪽 개념 트리, 오른쪽 선택한 개념의 카드. 좁은 화면에서는 위아래로 쌓는다.
import { useState } from "react";
import { cardsOfNode, type TopNode, type TreeCard } from "@/lib/rules/tree";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" });

export function ConceptTree({ tree, renderCardActions }: { tree: TopNode[]; renderCardActions?: (card: TreeCard) => React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const cards = cardsOfNode(tree, selected);
  const total = cardsOfNode(tree, null).length;

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <nav aria-label="개념 트리" className="flex flex-col gap-1 text-sm">
        <NodeButton active={selected === null} onClick={() => setSelected(null)} label="전체" count={total} />
        {tree.map((top) => (
          <div key={top.key} className="flex flex-col gap-1">
            <NodeButton active={selected === top.key} onClick={() => setSelected(top.key)} label={top.name} count={top.count} strong />
            {top.id !== null && top.subs.map((sub) => (
              <NodeButton
                key={sub.key}
                active={selected === sub.key}
                onClick={() => setSelected(sub.key)}
                label={sub.name}
                count={sub.cards.length}
                indent
                badge={sub.proposed ? "제안" : undefined}
              />
            ))}
          </div>
        ))}
      </nav>

      <section aria-label="카드 목록" className="flex flex-col gap-3">
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-500">{total === 0 ? "아직 기록된 카드가 없습니다. Claude에서 기록하면 여기에 나타납니다." : "이 개념에는 카드가 없습니다."}</p>
        ) : (
          cards.map((card) => <CardItem key={card.id} card={card} actions={renderCardActions?.(card)} />)
        )}
      </section>
    </div>
  );
}

function NodeButton(props: { active: boolean; onClick: () => void; label: string; count: number; strong?: boolean; indent?: boolean; badge?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.active ? "true" : undefined}
      className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left ${props.indent ? "ml-4" : ""} ${props.strong ? "font-semibold" : ""} ${props.active ? "bg-black/10 dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
    >
      <span className="flex items-center gap-2">
        {props.label}
        {props.badge && <span className="rounded-full border border-amber-500 px-1.5 text-xs text-amber-700 dark:text-amber-400">{props.badge}</span>}
      </span>
      <span className="text-xs text-zinc-500">{props.count}</span>
    </button>
  );
}

function Badge({ text, tone }: { text: string; tone: "gray" | "amber" | "blue" }) {
  const color = tone === "amber" ? "border-amber-500 text-amber-700 dark:text-amber-400" : tone === "blue" ? "border-sky-500 text-sky-700 dark:text-sky-400" : "border-zinc-400 text-zinc-600 dark:text-zinc-400";
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${color}`}>{text}</span>;
}

function CardItem({ card, actions }: { card: TreeCard; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const classification = card.topName ? `${card.topName} > ${card.subName ?? "하위 미정"}` : "미분류";
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-black/15 p-4 dark:border-white/20">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex flex-col gap-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{card.title}</span>
          <span className="text-xs text-zinc-500">{dateFormat.format(new Date(card.createdAt))}</span>
          {card.status === "pending" && <Badge text="분류 중" tone="blue" />}
          {card.status === "waiting" && <Badge text="미분류(대기)" tone="amber" />}
          {card.hasEstimate && <Badge text="추정" tone="amber" />}
          {card.noEvidence && <Badge text="근거 없음" tone="gray" />}
          {card.subUndecided && <Badge text="하위 미정" tone="gray" />}
        </span>
        {card.summary !== "" && <span className="text-sm text-zinc-700 dark:text-zinc-300">{card.summary}</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-black/10 pt-2 text-sm dark:border-white/15">
          {card.evidence.length > 0 && (
            <ul className="flex flex-col gap-1 text-zinc-600 dark:text-zinc-400">
              {card.evidence.map((e, i) => (
                <li key={i} className="border-l-2 border-zinc-300 pl-2 dark:border-zinc-600">“{e}”</li>
              ))}
            </ul>
          )}
          {card.keywords.length > 0 && <p className="text-zinc-600 dark:text-zinc-400">{card.keywords.map((k) => `#${k}`).join(" ")}</p>}
          <p className="text-zinc-600 dark:text-zinc-400">분류: {classification}</p>
          {card.candidates.length > 0 && (
            <p className="text-xs text-zinc-500">후보: {card.candidates.map((c) => `${c.top}${c.sub ? ` > ${c.sub}` : ""}${c.isNewSub ? " (신규)" : ""}`).join(" / ")}</p>
          )}
          {actions}
        </div>
      )}
    </article>
  );
}
