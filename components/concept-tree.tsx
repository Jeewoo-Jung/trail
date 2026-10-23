"use client";

// Design Ref: DESIGN.md §3.2~3.3 — 왼쪽 개념 트리, 오른쪽 선택한 개념의 카드. 좁은 화면에서는 위아래로 쌓는다.
import { useState } from "react";
import { cardsOfNode, type TopNode, type TreeCard } from "@/lib/rules/tree";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" });

type FormAction = (formData: FormData) => Promise<void>;

export function ConceptTree({
  tree,
  deleteCard,
  approveSub,
  rejectSub,
}: {
  tree: TopNode[];
  deleteCard?: FormAction;
  approveSub?: FormAction;
  rejectSub?: FormAction;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const cards = cardsOfNode(tree, selected);
  const total = cardsOfNode(tree, null).length;

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
      <nav aria-label="개념 트리" className="flex flex-col gap-1 text-sm">
        <NodeRow active={selected === null} onSelect={() => setSelected(null)} label="전체" count={total} />
        {tree.map((top) => {
          const foldable = top.id !== null; // "미분류"는 하위가 하나뿐이라 접을 것이 없다
          const open = !collapsed.has(top.key);
          return (
            <div key={top.key} className="flex flex-col gap-1">
              <NodeRow
                active={selected === top.key}
                onSelect={() => setSelected(top.key)}
                label={top.name}
                count={top.count}
                strong
                expanded={foldable ? open : undefined}
                onToggle={foldable ? () => toggle(top.key) : undefined}
              />
              {foldable &&
                open &&
                top.subs.map((sub) => (
                  <NodeRow
                    key={sub.key}
                    active={selected === sub.key}
                    onSelect={() => setSelected(sub.key)}
                    label={sub.name}
                    count={sub.cards.length}
                    indent
                    badge={sub.proposed ? "제안" : undefined}
                    proposal={sub.proposed && sub.id && approveSub && rejectSub ? { subId: sub.id, approve: approveSub, reject: rejectSub } : undefined}
                  />
                ))}
            </div>
          );
        })}
      </nav>

      <section aria-label="카드 목록" className="flex flex-col gap-3">
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-500">{total === 0 ? "아직 기록된 카드가 없습니다. Claude에서 기록하면 여기에 나타납니다." : "이 개념에는 카드가 없습니다."}</p>
        ) : (
          cards.map((card) => <CardItem key={card.id} card={card} deleteCard={deleteCard} />)
        )}
      </section>
    </div>
  );
}

function NodeRow(props: {
  active: boolean;
  onSelect: () => void;
  label: string;
  count: number;
  strong?: boolean;
  indent?: boolean;
  badge?: string;
  /** 접고 펼 수 있는 노드면 현재 펼쳐져 있는지. 없으면 접을 수 없는 노드다. */
  expanded?: boolean;
  onToggle?: () => void;
  proposal?: { subId: string; approve: FormAction; reject: FormAction };
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg ${props.indent ? "ml-4" : ""} ${props.active ? "bg-black/10 dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"}`}>
      <div className="flex items-center">
        {props.onToggle ? (
          <button
            type="button"
            onClick={props.onToggle}
            aria-expanded={props.expanded}
            aria-label={`${props.label} ${props.expanded ? "접기" : "펼치기"}`}
            className="w-6 shrink-0 py-1.5 text-center text-xs text-zinc-500"
          >
            {props.expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={props.onSelect}
          aria-current={props.active ? "true" : undefined}
          className={`flex flex-1 items-center justify-between py-1.5 pr-3 text-left ${props.strong ? "font-semibold" : ""}`}
        >
          <span className="flex items-center gap-2">
            {props.label}
            {props.badge && <span className="rounded-full border border-amber-500 px-1.5 text-xs text-amber-700 dark:text-amber-400">{props.badge}</span>}
          </span>
          <span className="text-xs text-zinc-500">{props.count}</span>
        </button>
      </div>
      {props.proposal && (
        <div className="flex gap-2 pb-1.5 pl-6">
          <form action={props.proposal.approve}>
            <input type="hidden" name="sub_id" value={props.proposal.subId} />
            <button type="submit" className="rounded-full bg-black px-3 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-black">승인</button>
          </form>
          <form action={props.proposal.reject}>
            <input type="hidden" name="sub_id" value={props.proposal.subId} />
            <button type="submit" className="rounded-full border border-black/15 px-3 py-0.5 text-xs font-medium dark:border-white/20">거절</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "gray" | "amber" | "blue" }) {
  const color = tone === "amber" ? "border-amber-500 text-amber-700 dark:text-amber-400" : tone === "blue" ? "border-sky-500 text-sky-700 dark:text-sky-400" : "border-zinc-400 text-zinc-600 dark:text-zinc-400";
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${color}`}>{text}</span>;
}

export function CardItem({ card, deleteCard }: { card: TreeCard; deleteCard?: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
          {deleteCard && (
            <div className="flex items-center gap-2">
              {confirming ? (
                <form action={deleteCard} className="flex items-center gap-2">
                  <input type="hidden" name="card_id" value={card.id} />
                  <span className="text-xs text-red-600">이 카드를 삭제합니다. 되돌릴 수 없습니다.</span>
                  <button type="submit" className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white">삭제</button>
                  <button type="button" onClick={() => setConfirming(false)} className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20">취소</button>
                </form>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="rounded-full border border-black/15 px-3 py-1 text-xs dark:border-white/20">삭제</button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
