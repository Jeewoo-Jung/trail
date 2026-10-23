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
          <p className="text-sm text-subtle">{total === 0 ? "아직 기록된 카드가 없습니다. Claude에서 기록하면 여기에 나타납니다." : "이 개념에는 카드가 없습니다."}</p>
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
    <div className={`flex flex-col gap-1 rounded-xl ${props.indent ? "ml-4" : ""} ${props.active ? "bg-surface-active" : "hover:bg-surface-hover"}`}>
      <div className="flex items-center">
        {props.onToggle ? (
          <button
            type="button"
            onClick={props.onToggle}
            aria-expanded={props.expanded}
            aria-label={`${props.label} ${props.expanded ? "접기" : "펼치기"}`}
            className="w-6 shrink-0 py-1.5 text-center text-xs text-subtle"
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
            {props.badge && <span className="rounded-full border border-warn px-1.5 text-xs text-warn">{props.badge}</span>}
          </span>
          <span className="text-xs text-subtle">{props.count}</span>
        </button>
      </div>
      {props.proposal && (
        <div className="flex gap-2 pb-1.5 pl-6">
          <form action={props.proposal.approve}>
            <input type="hidden" name="sub_id" value={props.proposal.subId} />
            <button type="submit" className="rounded-xl bg-brand hover:brightness-110 px-3 py-0.5 text-xs font-medium text-on-accent">승인</button>
          </form>
          <form action={props.proposal.reject}>
            <input type="hidden" name="sub_id" value={props.proposal.subId} />
            <button type="submit" className="rounded-xl border border-line hover:bg-surface-hover px-3 py-0.5 text-xs font-medium">거절</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "gray" | "amber" | "blue" }) {
  const color = tone === "amber" ? "border-warn text-warn" : tone === "blue" ? "border-info text-info" : "border-line text-muted";
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${color}`}>{text}</span>;
}

export function CardItem({ card, deleteCard }: { card: TreeCard; deleteCard?: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const classification = card.topName ? `${card.topName} > ${card.subName ?? "하위 미정"}` : "미분류";
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-line p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex flex-col gap-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{card.title}</span>
          <span className="text-xs text-subtle">{dateFormat.format(new Date(card.createdAt))}</span>
          {card.status === "pending" && <Badge text="분류 중" tone="blue" />}
          {card.status === "waiting" && <Badge text="미분류(대기)" tone="amber" />}
          {card.hasEstimate && <Badge text="추정" tone="amber" />}
          {card.noEvidence && <Badge text="근거 없음" tone="gray" />}
          {card.subUndecided && <Badge text="하위 미정" tone="gray" />}
        </span>
        {card.summary !== "" && <span className="text-sm text-muted">{card.summary}</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line pt-2 text-sm">
          {card.evidence.length > 0 && (
            <ul className="flex flex-col gap-1 text-muted">
              {card.evidence.map((e, i) => (
                <li key={i} className="border-l-2 border-line pl-2">“{e}”</li>
              ))}
            </ul>
          )}
          {card.keywords.length > 0 && <p className="text-muted">{card.keywords.map((k) => `#${k}`).join(" ")}</p>}
          <p className="text-muted">분류: {classification}</p>
          {card.candidates.length > 0 && (
            <p className="text-xs text-subtle">후보: {card.candidates.map((c) => `${c.top}${c.sub ? ` > ${c.sub}` : ""}${c.isNewSub ? " (신규)" : ""}`).join(" / ")}</p>
          )}
          {deleteCard && (
            <div className="flex items-center gap-2">
              {confirming ? (
                <form action={deleteCard} className="flex items-center gap-2">
                  <input type="hidden" name="card_id" value={card.id} />
                  <span className="text-xs text-danger">이 카드를 삭제합니다. 되돌릴 수 없습니다.</span>
                  <button type="submit" className="rounded-full bg-danger px-3 py-1 text-xs font-medium text-on-accent">삭제</button>
                  <button type="button" onClick={() => setConfirming(false)} className="rounded-xl border border-line hover:bg-surface-hover px-3 py-1 text-xs">취소</button>
                </form>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="rounded-xl border border-line hover:bg-surface-hover px-3 py-1 text-xs">삭제</button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
