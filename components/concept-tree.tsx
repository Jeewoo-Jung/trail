"use client";

// Design Ref: DESIGN.md §3.2~3.3 — 왼쪽 개념 트리, 오른쪽 선택한 개념의 카드. 좁은 화면에서는 위아래로 쌓는다.
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { classificationLabel, cardsOfNode, findNode, type ConceptNode, type TreeCard } from "@/lib/rules/tree";
import { Badge as UiBadge, buttonClass, EmptyState } from "@/components/ui";
const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" });

type FormAction = (formData: FormData) => Promise<void>;

export function ConceptTree({
  tree,
  deleteCard,
  approveConcept,
  rejectConcept,
}: {
  tree: ConceptNode[];
  deleteCard?: FormAction;
  approveConcept?: FormAction;
  rejectConcept?: FormAction;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const cards = cardsOfNode(tree, selected);
  const total = cardsOfNode(tree, null).length;
  const selectedNode = selected ? findNode(tree, selected) : null;

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const branch = (node: ConceptNode, parentProposed: boolean): React.ReactNode => {
    const foldable = node.children.length > 0;
    const open = !collapsed.has(node.key);
    return (
      <div key={node.key} className="flex flex-col gap-1">
        <NodeRow
          active={selected === node.key}
          onSelect={() => setSelected(node.key)}
          label={node.name}
          count={node.count}
          strong={node.depth === 1}
          depth={node.depth - 1}
          badge={node.proposed ? "제안" : undefined}
          expanded={foldable ? open : undefined}
          onToggle={foldable ? () => toggle(node.key) : undefined}
          // 제안 중인 가지는 맨 위 노드에서만 승인·거절한다(가지째 처리하므로).
          proposal={node.proposed && !parentProposed && node.id && approveConcept && rejectConcept ? { id: node.id, approve: approveConcept, reject: rejectConcept } : undefined}
        />
        {foldable && open && node.children.map((child) => branch(child, parentProposed || node.proposed))}
      </div>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
      <nav aria-label="개념 트리" className="flex flex-col gap-1 text-sm">
        <NodeRow active={selected === null} onSelect={() => setSelected(null)} label="전체" count={total} />
        {tree.map((root) => branch(root, false))}
      </nav>

      <section aria-label="카드 목록" className="flex flex-col gap-3">
        {selectedNode && selectedNode.path.length > 1 && <p className="text-xs text-subtle">{selectedNode.path.join(" › ")}</p>}
        {cards.length === 0 ? (
          <EmptyState title={total === 0 ? "아직 기록된 카드가 없습니다" : "이 개념에는 카드가 없습니다"}>{total === 0 ? "Claude에서 기록하면 여기에 나타납니다." : "다른 개념을 골라 보세요."}</EmptyState>
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
  /** 들여쓰기 단계(0이 뿌리) */
  depth?: number;
  badge?: string;
  /** 접고 펼 수 있는 노드면 현재 펼쳐져 있는지. 없으면 접을 수 없는 노드다. */
  expanded?: boolean;
  onToggle?: () => void;
  proposal?: { id: string; approve: FormAction; reject: FormAction };
}) {
  return (
    <div style={{ marginLeft: `${(props.depth ?? 0) * 14}px` }} className={`flex flex-col gap-1 rounded-xl ${props.active ? "bg-surface-active ring-1 ring-line-strong" : "hover:bg-surface-hover"}`}>
      <div className="flex items-center">
        {props.onToggle ? (
          <button
            type="button"
            onClick={props.onToggle}
            aria-expanded={props.expanded}
            aria-label={`${props.label} ${props.expanded ? "접기" : "펼치기"}`}
            className="w-6 shrink-0 py-1.5 text-center text-xs text-subtle"
          >
            {props.expanded ? <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="mx-auto" /> : <ChevronRight size={14} strokeWidth={1.5} aria-hidden className="mx-auto" />}
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
            {props.badge && <UiBadge tone="warn">{props.badge}</UiBadge>}
          </span>
          <span className="font-mono text-xs text-subtle">{props.count}</span>
        </button>
      </div>
      {props.proposal && (
        <div className="flex gap-2 pb-1.5 pl-6">
          <form action={props.proposal.approve}>
            <input type="hidden" name="concept_id" value={props.proposal.id} />
            <button type="submit" className={buttonClass.primary}>승인</button>
          </form>
          <form action={props.proposal.reject}>
            <input type="hidden" name="concept_id" value={props.proposal.id} />
            <button type="submit" className={buttonClass.secondary}>거절</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "gray" | "amber" | "blue" }) {
  return <UiBadge tone={tone === "amber" ? "warn" : tone === "blue" ? "info" : "neutral"}>{text}</UiBadge>;
}

export function CardItem({ card, deleteCard }: { card: TreeCard; deleteCard?: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const classification = classificationLabel(card.path);
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex flex-col gap-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{card.title}</span>
          <span className="font-mono text-xs text-subtle">{dateFormat.format(new Date(card.createdAt))}</span>
          {card.status === "pending" && <Badge text="분류 중" tone="blue" />}
          {card.status === "waiting" && <Badge text="미분류(대기)" tone="amber" />}
          {card.hasEstimate && <Badge text="추정" tone="amber" />}
          {card.noEvidence && <Badge text="근거 없음" tone="gray" />}
          {card.subUndecided && <Badge text="하위 미정" tone="gray" />}
        </span>
        {card.summary !== "" && <span className="font-serif text-[15px] text-muted">{card.summary}</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line pt-2 text-sm">
          {card.evidence.length > 0 && (
            <ul className="flex flex-col gap-1 text-muted">
              {card.evidence.map((e, i) => (
                <li key={i} className="quote-block font-serif">“{e}”</li>
              ))}
            </ul>
          )}
          {card.keywords.length > 0 && <p className="text-muted">{card.keywords.map((k) => `#${k}`).join(" ")}</p>}
          <p className="text-muted">분류: {classification}</p>
          {card.candidates.length > 0 && (
            <p className="text-xs text-subtle">후보: {card.candidates.map((c) => `${c.path.join(" > ")}${c.isNew ? " (신규)" : ""}`).join(" / ")}</p>
          )}
          {deleteCard && (
            <div className="flex items-center gap-2">
              {confirming ? (
                <form action={deleteCard} className="flex items-center gap-2">
                  <input type="hidden" name="card_id" value={card.id} />
                  <span className="text-xs text-danger">이 카드를 삭제합니다. 되돌릴 수 없습니다.</span>
                  <button type="submit" className={buttonClass.danger}>삭제</button>
                  <button type="button" onClick={() => setConfirming(false)} className={buttonClass.secondary}>취소</button>
                </form>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className={buttonClass.secondary}>삭제</button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
