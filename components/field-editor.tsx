"use client";

// STAR 항목 하나(상황·과제·내가 한 일·결과·외부 결과)의 인라인 편집: 내용·주체·잠금·근거·들어온 제안.
// 내가 저장하면 그 항목은 잠겨 이후 AI 기록이 덮어쓰지 않는다(새 내용은 제안으로만 쌓인다).
import { Lock, LockOpen, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { NodeActions } from "@/components/node-actions";
import { Message, useAction } from "@/components/use-action";
import { Badge, buttonClass } from "@/components/ui";
import { EVIDENCE_LIMITS, STAR_LIMITS } from "@/lib/rules/limits";
import { countChars } from "@/lib/rules/text";
import { STAR_FIELD_LABEL, SUBJECT_LABEL, SUBJECTS, type StarField, type Subject } from "@/lib/rules/nodes";
import type { EvidenceRow, FieldRow, SuggestionRow } from "@/lib/rules/node-tree";

const inputClass = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm";

type Props = { nodeId: string; field: StarField; row: FieldRow | undefined; evidence: EvidenceRow[]; suggestions: SuggestionRow[]; actions?: NodeActions; hint?: string };

export function FieldEditor({ nodeId, field, row, evidence, suggestions, actions, hint }: Props) {
  const limit = STAR_LIMITS[field];
  const [text, setText] = useState(row?.text ?? "");
  const [subject, setSubject] = useState<Subject>(row?.subject ?? "did");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const save = useAction();
  const other = useAction();
  const dirty = text !== (row?.text ?? "") || (row ? subject !== row.subject : text.trim() !== "" && subject !== "did");
  const over = countChars(text) > limit;

  return (
    <section aria-label={STAR_FIELD_LABEL[field]} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm">{STAR_FIELD_LABEL[field]}</h3>
        {row ? (
          <button
            type="button"
            disabled={!actions || other.pending}
            onClick={() => actions && other.run(() => actions.setLock(nodeId, field, !row.locked))}
            aria-label={row.locked ? `${STAR_FIELD_LABEL[field]} 잠금 풀기` : `${STAR_FIELD_LABEL[field]} 잠그기`}
            title={row.locked ? "내가 고쳐서 잠겨 있습니다. 누르면 풀려서 AI 기록이 고칠 수 있게 됩니다." : "잠겨 있지 않습니다. 누르면 잠깁니다."}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:bg-surface-hover disabled:opacity-60"
          >
            {row.locked ? <Lock size={12} strokeWidth={1.5} aria-hidden /> : <LockOpen size={12} strokeWidth={1.5} aria-hidden />}
            {row.locked ? "잠금" : "열림"}
          </button>
        ) : null}
        {row && <Badge tone={row.updatedBy === "ai" ? "info" : "neutral"}>{row.updatedBy === "ai" ? "자동 생성" : "내가 작성"}</Badge>}
        {suggestions.length > 0 && <Badge tone="warn">{`제안 ${suggestions.length}`}</Badge>}
      </div>
      {hint && !row && !actions && <p className="text-xs text-subtle">{hint}</p>}

      {actions ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(() => actions.setField(nodeId, field, text, subject));
          }}
        >
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={field === "action" ? 5 : 3} aria-label={STAR_FIELD_LABEL[field]} placeholder={hint ?? "비어 있음(미입력)"} className={`${inputClass} ${over ? "border-danger" : ""}`} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-muted">
              주체
              <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} className="rounded-lg border border-line bg-surface px-2 py-1 text-fg">
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <span className={over ? "text-danger" : "text-subtle"}>{countChars(text)} / {limit}자</span>
            <button type="submit" disabled={!dirty || over || save.pending} className={buttonClass.primary}>저장</button>
            {dirty && <button type="button" className={buttonClass.secondary} onClick={() => { setText(row?.text ?? ""); setSubject(row?.subject ?? "did"); save.clear(); }}>되돌리기</button>}
          </div>
          <Message message={save.message} />
        </form>
      ) : (
        <div className="flex flex-col gap-1">
          {row ? (
            <>
              <p className="whitespace-pre-wrap text-[15px]">{row.text}</p>
              <p className="text-xs text-muted">{SUBJECT_LABEL[row.subject]}</p>
            </>
          ) : (
            <p className="text-sm text-subtle">비어 있음(미입력)</p>
          )}
        </div>
      )}

      {evidence.length > 0 && (
        <ul className="flex flex-col gap-2">
          {evidence.map((e) =>
            editing === e.id && actions ? (
              <li key={e.id}>
                <EvidenceForm initial={e} submitLabel="저장" onCancel={() => setEditing(null)} onSubmit={(v) => other.run(() => actions.updateEvidence(e.id, v), () => setEditing(null))} pending={other.pending} />
              </li>
            ) : (
              <li key={e.id} className="quote-block flex flex-col gap-1">
                <p className="text-sm text-muted">“{e.excerpt}”</p>
                <p className="text-xs text-subtle">{e.conversationTitle} · {e.conversationDate}</p>
                {actions && (
                  <span className="flex gap-1">
                    <button type="button" aria-label="근거 고치기" className="rounded-full p-1 text-muted hover:bg-surface-hover" onClick={() => setEditing(e.id)}><Pencil size={14} strokeWidth={1.5} aria-hidden /></button>
                    <button type="button" aria-label="근거 지우기" disabled={other.pending} className="rounded-full p-1 text-muted hover:bg-surface-hover" onClick={() => other.run(() => actions.removeEvidence(e.id))}><Trash2 size={14} strokeWidth={1.5} aria-hidden /></button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {actions && row && evidence.length < EVIDENCE_LIMITS.maxPerField && (adding ? (
        <EvidenceForm submitLabel="근거 추가" onCancel={() => setAdding(false)} onSubmit={(v) => other.run(() => actions.addEvidence(nodeId, field, v), () => setAdding(false))} pending={other.pending} />
      ) : (
        <button type="button" className={`${buttonClass.secondary} self-start`} onClick={() => setAdding(true)}>근거 추가</button>
      ))}

      {suggestions.map((s) => (
        <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-warn/50 bg-surface-hover p-3">
          <p className="text-xs text-warn">새 기록에서 들어온 제안 · {SUBJECT_LABEL[s.subject]}</p>
          <p className="whitespace-pre-wrap text-sm">{s.text}</p>
          {s.evidence.length > 0 && <p className="text-xs text-subtle">근거 {s.evidence.length}개 · {s.evidence[0].conversationTitle}</p>}
          {actions && (
            <span className="flex flex-wrap gap-2">
              {row && <button type="button" disabled={other.pending} className={buttonClass.secondary} onClick={() => other.run(() => actions.resolveSuggestion(s.id, "append"))}>덧붙이기</button>}
              <button type="button" disabled={other.pending} className={buttonClass.secondary} onClick={() => other.run(() => actions.resolveSuggestion(s.id, "replace"))}>{row ? "바꾸기" : "채우기"}</button>
              <button type="button" disabled={other.pending} className={buttonClass.secondary} onClick={() => other.run(() => actions.resolveSuggestion(s.id, "reject"))}>거절</button>
            </span>
          )}
        </div>
      ))}
      <Message message={other.message} />
    </section>
  );
}

function EvidenceForm({ initial, submitLabel, onSubmit, onCancel, pending }: { initial?: { conversationTitle: string; conversationDate: string; excerpt: string }; submitLabel: string; onSubmit: (v: { conversationTitle: string; conversationDate: string; excerpt: string }) => void; onCancel: () => void; pending: boolean }) {
  const [title, setTitle] = useState(initial?.conversationTitle ?? "");
  const [date, setDate] = useState(initial?.conversationDate ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ conversationTitle: title, conversationDate: date, excerpt });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="대화 제목" aria-label="대화 제목" maxLength={EVIDENCE_LIMITS.titleMaxChars} className={`${inputClass} min-w-0 flex-1`} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="대화 날짜" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
      </div>
      <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} placeholder="원문 발췌" aria-label="원문 발췌" maxLength={EVIDENCE_LIMITS.excerptMaxChars} className={inputClass} />
      <span className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>{submitLabel}</button>
        <button type="button" className={buttonClass.secondary} onClick={onCancel}>취소</button>
      </span>
    </form>
  );
}
