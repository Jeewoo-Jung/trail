"use client";

// 선택한 노드의 상세와 편집: 이름·종류·상태·기간·설명·위치, STAR 항목, 산출물, 하위 추가·합치기·쪼개기·휴지통.
// 모든 필드를 바로(인라인) 고치고, 고친 필드는 잠금 표시가 붙는다. actions가 없으면(샘플 화면) 읽기 전용이다.
import { Lock } from "lucide-react";
import { useState } from "react";
import { FieldEditor } from "@/components/field-editor";
import { openStoredFile, removeStoredFile, uploadOutputFile } from "@/components/stored-files";
import type { NodeActions } from "@/components/node-actions";
import { Message, useAction } from "@/components/use-action";
import { Badge, buttonClass } from "@/components/ui";
import { NODE_LIMITS } from "@/lib/rules/limits";
import { childKindsFor, kindChoices, mergeCandidates, moveTargets, type NodeData, type NodeTree, type TreeNode } from "@/lib/rules/node-tree";
import { hasStar, NODE_KIND_LABEL, PORTFOLIO_LABEL, PORTFOLIO_STATUSES, STAR_FIELD_LABEL, type NodeKind, type NodeLockable, type PortfolioStatus, type StarField } from "@/lib/rules/nodes";

const inputClass = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm";
const LOCK_LABEL: Record<NodeLockable, string> = { name: "이름", kind: "종류", parent: "위치", period: "기간", description: "설명", portfolio_status: "상태" };
const AI_FIELDS: StarField[] = ["situation", "task", "action", "result_conversation"];

type Props = { tree: NodeTree; data: NodeData; node: TreeNode; actions?: NodeActions; onSelect: (id: string | null) => void; userId?: string; nowIso?: string };

export function NodeDetail({ tree, data, node, actions, onSelect, userId, nowIso }: Props) {
  const parent = node.parentId ? tree.byId.get(node.parentId) : undefined;
  const fields = data.fields.filter((f) => f.nodeId === node.id);
  const evidence = data.evidence.filter((e) => e.nodeId === node.id);
  const suggestions = data.suggestions.filter((s) => s.nodeId === node.id);
  const outputs = data.outputs.filter((o) => o.nodeId === node.id);
  const star = hasStar(node.kind);

  return (
    <article className="flex flex-col gap-4" aria-label={`${node.name} 상세`}>
      <header className="flex flex-col gap-1">
        <p className="text-xs text-subtle">{node.path.join(" › ")}</p>
        {actions && <ExcludeToggle node={node} actions={actions} />}
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{NODE_KIND_LABEL[node.kind]}</Badge>
          <Badge tone={node.portfolioStatus === "excluded" ? "warn" : "neutral"}>{PORTFOLIO_LABEL[node.portfolioStatus]}</Badge>
          {node.effectiveExcluded && node.portfolioStatus !== "excluded" && <Badge tone="warn">상위에서 제외됨</Badge>}
          {node.createdBy === "ai" && <Badge tone="info">자동 생성</Badge>}
        </div>
      </header>

      {/* key로 노드가 바뀔 때 입력 상태를 새로 시작한다 */}
      <NodeProps key={`${node.id}:${node.updatedAt}`} tree={tree} data={data} node={node} parent={parent} hasFields={fields.length > 0} actions={actions} />

      {star && (
        <div className="flex flex-col gap-3">
          {AI_FIELDS.map((f) => (
            <FieldEditor key={`${node.id}:${f}:${fields.find((x) => x.field === f)?.text ?? ""}`} nodeId={node.id} field={f} row={fields.find((x) => x.field === f)} evidence={evidence.filter((e) => e.field === f)} suggestions={suggestions.filter((s) => s.field === f)} actions={actions} />
          ))}
          <FieldEditor key={`${node.id}:result_external:${fields.find((x) => x.field === "result_external")?.text ?? ""}`} nodeId={node.id} field="result_external" row={fields.find((x) => x.field === "result_external")} evidence={evidence.filter((e) => e.field === "result_external")} suggestions={suggestions.filter((s) => s.field === "result_external")} actions={actions} hint="미입력 — 결과가 나오면 직접 적어 주세요(합격·평가 등)." />
          <ResultState node={node} nowIso={nowIso} filled={fields.some((f) => f.field === "result_external" && f.text.trim() !== "") || outputs.some((o) => o.isFinal)} actions={actions} />
          <Outputs nodeId={node.id} outputs={outputs} actions={actions} userId={userId} />
        </div>
      )}

      {actions && <NodeActionsBar tree={tree} node={node} actions={actions} onSelect={onSelect} />}
    </article>
  );
}

/** 빠른 제외: 삭제가 아니라 상태다. 제외하면 아래 노드도 문서·내려받기에서 빠지고(자식만 따로 제외해도 된다), 해제하면 소재 후보로 돌아온다. */
function ExcludeToggle({ node, actions }: { node: TreeNode; actions: NodeActions }) {
  const act = useAction();
  const below = (n: TreeNode): number => n.children.reduce((s, c) => s + 1 + below(c), 0);
  const excluded = node.portfolioStatus === "excluded";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button type="button" disabled={act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.update(node.id, { portfolioStatus: excluded ? "candidate" : "excluded" }))}>
        {excluded ? "제외 해제" : "제외하기"}
      </button>
      <span className="text-xs text-muted">
        {excluded
          ? "제외 상태입니다. 문서·내려받기에서 빠지고 Claude도 여기에 기록하지 않습니다."
          : node.effectiveExcluded
            ? "상위 노드가 제외되어 함께 빠져 있습니다. 이 노드만 제외 해제하려면 상위의 제외를 풀어 주세요."
            : below(node) > 0
              ? `제외하면 아래 ${below(node)}개도 함께 빠집니다(삭제는 아닙니다).`
              : "삭제가 아니라 상태입니다. 언제든 해제할 수 있습니다."}
      </span>
      <Message message={act.message} />
    </div>
  );
}

function LockChip({ node, which, actions }: { node: TreeNode; which: NodeLockable; actions?: NodeActions }) {
  const act = useAction();
  if (!node.lockedFields.includes(which)) return null;
  return (
    <button
      type="button"
      disabled={!actions || act.pending}
      onClick={() => actions && act.run(() => actions.unlock(node.id, which))}
      title={`${LOCK_LABEL[which]}: 내가 고쳐서 잠겨 있습니다. 누르면 풀려서 AI 기록이 고칠 수 있게 됩니다.`}
      aria-label={`${LOCK_LABEL[which]} 잠금 풀기`}
      className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-hover disabled:opacity-60"
    >
      <Lock size={11} strokeWidth={1.5} aria-hidden />
      잠금
    </button>
  );
}

function NodeProps({ tree, data, node, parent, hasFields, actions }: { tree: NodeTree; data: NodeData; node: TreeNode; parent?: TreeNode; hasFields: boolean; actions?: NodeActions }) {
  const [name, setName] = useState(node.name);
  const [kind, setKind] = useState<NodeKind>(node.kind);
  const [status, setStatus] = useState<PortfolioStatus>(node.portfolioStatus);
  const [start, setStart] = useState(node.startDate ?? "");
  const [end, setEnd] = useState(node.endDate ?? "");
  const [description, setDescription] = useState(node.description);
  const save = useAction();
  const move = useAction();
  const dirty = name !== node.name || kind !== node.kind || status !== node.portfolioStatus || start !== (node.startDate ?? "") || end !== (node.endDate ?? "") || description !== node.description;
  const kinds = kindChoices(node, parent, hasFields);
  const targets = actions ? moveTargets(tree, data.nodes, node.id) : [];

  if (!actions) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <h2 className="text-xl">{node.name}</h2>
        {(node.startDate || node.endDate) && <p className="text-muted">{node.startDate ?? "?"} ~ {node.endDate ?? "?"}</p>}
        {node.description && <p className="whitespace-pre-wrap text-muted">{node.description}</p>}
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const patch: Record<string, string> = {};
        if (name !== node.name) patch.name = name;
        if (kind !== node.kind) patch.kind = kind;
        if (status !== node.portfolioStatus) patch.portfolioStatus = status;
        if (start !== (node.startDate ?? "")) patch.startDate = start;
        if (end !== (node.endDate ?? "")) patch.endDate = end;
        if (description !== node.description) patch.description = description;
        save.run(() => actions.update(node.id, patch));
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2 text-muted">이름 <LockChip node={node} which="name" actions={actions} /></span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NODE_LIMITS.nameMaxChars} className={`${inputClass} text-base`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2 text-muted">종류 <LockChip node={node} which="kind" actions={actions} /></span>
          <select value={kind} onChange={(e) => setKind(e.target.value as NodeKind)} className={inputClass}>
            {kinds.map((k) => <option key={k} value={k}>{NODE_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2 text-muted">포트폴리오 상태 <LockChip node={node} which="portfolio_status" actions={actions} /></span>
          <select value={status} onChange={(e) => setStatus(e.target.value as PortfolioStatus)} className={inputClass}>
            {PORTFOLIO_STATUSES.map((s) => <option key={s} value={s}>{PORTFOLIO_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2 text-muted">기간 <LockChip node={node} which="period" actions={actions} /></span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="시작일" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
          <span aria-hidden>~</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="종료일" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2 text-muted">설명 <LockChip node={node} which="description" actions={actions} /></span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={NODE_LIMITS.descriptionMaxChars} className={inputClass} />
      </label>
      <span className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!dirty || save.pending} className={buttonClass.primary}>저장</button>
        {dirty && <button type="button" className={buttonClass.secondary} onClick={() => { setName(node.name); setKind(node.kind); setStatus(node.portfolioStatus); setStart(node.startDate ?? ""); setEnd(node.endDate ?? ""); setDescription(node.description); save.clear(); }}>되돌리기</button>}
      </span>
      <Message message={save.message} />

      <label className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
        <span className="flex items-center gap-2 text-muted">위치(옮기기) <LockChip node={node} which="parent" actions={actions} /></span>
        <select
          value={node.parentId ?? ""}
          disabled={move.pending}
          aria-label="옮길 위치"
          onChange={(e) => move.run(() => actions.move(node.id, e.target.value === "" ? null : e.target.value))}
          className={inputClass}
        >
          {!targets.some((t) => t.id === node.parentId) && <option value={node.parentId ?? ""}>{parent ? parent.path.join(" › ") : "맨 위"}</option>}
          {targets.map((t) => <option key={t.id ?? "root"} value={t.id ?? ""}>{t.label}</option>)}
        </select>
      </label>
      <Message message={move.message} />
    </form>
  );
}

/** 결과 등록 상태: 비어 있으면 "결과 등록 대기"에 올라올 수 있고, 나중에·해당 없음으로 미룰 수 있다. */
function ResultState({ node, filled, actions, nowIso }: { node: TreeNode; filled: boolean; actions?: NodeActions; nowIso?: string }) {
  const act = useAction();
  if (node.kind !== "activity") return null;
  const state = filled ? "입력됨" : node.resultState === "not_applicable" ? "해당 없음" : node.resultState === "snoozed" && node.resultSnoozeUntil && Date.parse(node.resultSnoozeUntil) > Date.parse(nowIso ?? node.resultSnoozeUntil) - 1 ? `나중에(${node.resultSnoozeUntil.slice(0, 10)}까지 숨김)` : "미입력";
  return (
    <section aria-label="결과 등록 상태" className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <span className="text-muted">결과 등록</span>
      <Badge tone={filled ? "ok" : "neutral"}>{state}</Badge>
      {actions && !filled && (
        <span className="ml-auto flex flex-wrap gap-2">
          {node.resultState === "empty" ? (
            <>
              <button type="button" disabled={act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.setResultState(node.id, "snooze"))}>나중에</button>
              <button type="button" disabled={act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.setResultState(node.id, "not_applicable"))}>해당 없음</button>
            </>
          ) : (
            <button type="button" disabled={act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.setResultState(node.id, "reset"))}>다시 대기로</button>
          )}
        </span>
      )}
      <div className="w-full"><Message message={act.message} /></div>
    </section>
  );
}

function Outputs({ nodeId, outputs, actions, userId }: { nodeId: string; outputs: NodeData["outputs"]; actions?: NodeActions; userId?: string }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [final, setFinal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const act = useAction();
  const file = useAction();
  return (
    <section aria-label="산출물" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <h3 className="text-sm">산출물·최종 산출물 {outputs.length > 0 ? `(${outputs.length})` : ""}</h3>
      {outputs.length === 0 && <p className="text-sm text-subtle">미입력 — 링크나 파일을 등록할 수 있습니다(필수 아님). &lsquo;최종&rsquo;으로 표시하면 결과가 입력된 것으로 봅니다.</p>}
      <ul className="flex flex-col gap-2">
        {outputs.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
            {o.isFinal && <Badge tone="ok">최종</Badge>}
            {o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{o.name}</a> : <span>{o.name}</span>}
            {o.storagePath && <button type="button" className="text-accent hover:underline" onClick={() => void openStoredFile(o.storagePath!).then((m) => m && file.run(async () => ({ ok: false, message: m })))}>파일 열기</button>}
            {actions && (
              <span className="ml-auto flex gap-1">
                <button type="button" disabled={act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.updateOutput(o.id, { name: o.name, url: o.url ?? "", isFinal: !o.isFinal }))}>{o.isFinal ? "최종 해제" : "최종으로"}</button>
                <button type="button" disabled={act.pending} className={buttonClass.secondary} onClick={() => act.run(() => actions.removeOutput(o.id), (r) => { if (r.ok && r.storagePath) void removeStoredFile(r.storagePath); })}>지우기</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {actions && (
        <>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act.run(() => actions.addOutput(nodeId, { name, url, isFinal: final }), () => { setName(""); setUrl(""); setFinal(false); });
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="산출물 이름" aria-label="산출물 이름" maxLength={NODE_LIMITS.outputNameMaxChars} className={`${inputClass} min-w-0 flex-1`} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="링크(선택)" aria-label="산출물 링크" className={`${inputClass} min-w-0 flex-1`} />
            <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} />최종</label>
            <button type="submit" disabled={act.pending || name.trim() === ""} className={buttonClass.primary}>추가</button>
          </form>
          {userId && (
            <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
              파일 첨부(선택, 25MB 이하)
              <input
                type="file"
                disabled={uploading}
                aria-label="파일 첨부"
                onChange={async (e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = "";
                  if (!picked) return;
                  setUploading(true);
                  const up = await uploadOutputFile(userId, nodeId, picked);
                  if (!up.ok) {
                    setUploading(false);
                    file.run(async () => ({ ok: false, message: up.message }));
                    return;
                  }
                  file.run(
                    async () => {
                      const added = await actions.addOutput(nodeId, { name: picked.name.slice(0, NODE_LIMITS.outputNameMaxChars), isFinal: final, storagePath: up.path });
                      if (!added.ok) await removeStoredFile(up.path); // 기록하지 못한 파일은 남기지 않는다
                      setUploading(false);
                      return added;
                    },
                  );
                }}
              />
              {uploading && <span>올리는 중…</span>}
            </label>
          )}
          <Message message={act.message} />
          <Message message={file.message} />
        </>
      )}
    </section>
  );
}

function NodeActionsBar({ tree, node, actions, onSelect }: { tree: NodeTree; node: TreeNode; actions: NodeActions; onSelect: (id: string | null) => void }) {
  const [open, setOpen] = useState<"add" | "merge" | "split" | "trash" | null>(null);
  const kinds = childKindsFor(node.kind);
  const [kind, setKind] = useState<NodeKind>(kinds[0] ?? "activity");
  const [name, setName] = useState("");
  const [mergeId, setMergeId] = useState("");
  const [splitName, setSplitName] = useState("");
  const [splitFields, setSplitFields] = useState<Set<string>>(new Set());
  const [splitChildren, setSplitChildren] = useState<Set<string>>(new Set());
  const act = useAction();
  const merges = mergeCandidates(tree, node);
  const subs = node.children.filter((c) => c.kind === "subactivity");
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };
  const close = () => { setOpen(null); setName(""); setMergeId(""); setSplitName(""); setSplitFields(new Set()); setSplitChildren(new Set()); act.clear(); };

  return (
    <section aria-label="노드 작업" className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap gap-2">
        {kinds.length > 0 && <button type="button" className={buttonClass.secondary} onClick={() => { close(); setOpen("add"); }}>하위 노드 추가</button>}
        {merges.length > 0 && <button type="button" className={buttonClass.secondary} onClick={() => { close(); setOpen("merge"); }}>다른 활동과 합치기</button>}
        {hasStar(node.kind) && <button type="button" className={buttonClass.secondary} onClick={() => { close(); setOpen("split"); }}>쪼개기</button>}
        <button type="button" className={buttonClass.danger} onClick={() => { close(); setOpen("trash"); }}>휴지통으로</button>
      </div>

      {open === "add" && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); act.run(() => actions.create(node.id, kind, name), (r) => { close(); if (r.ok && r.id) onSelect(r.id); }); }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as NodeKind)} aria-label="새 노드 종류" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            {kinds.map((k) => <option key={k} value={k}>{NODE_KIND_LABEL[k]}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" aria-label="새 노드 이름" maxLength={NODE_LIMITS.nameMaxChars} autoFocus className={`${inputClass} min-w-0 flex-1`} />
          <button type="submit" disabled={act.pending} className={buttonClass.primary}>추가</button>
          <button type="button" className={buttonClass.secondary} onClick={close}>취소</button>
        </form>
      )}

      {open === "merge" && (
        <form className="flex flex-col gap-2 rounded-2xl border border-line p-3 text-sm" onSubmit={(e) => { e.preventDefault(); act.run(() => actions.merge(node.id, mergeId), () => close()); }}>
          <p>고른 활동의 항목·근거·산출물·세부활동을 이 활동(“{node.name}”)으로 가져오고, 고른 활동은 휴지통으로 보냅니다. 같은 항목은 이어 붙이며, 한도를 넘으면 합치지 않습니다.</p>
          <select value={mergeId} onChange={(e) => setMergeId(e.target.value)} aria-label="합칠 활동" className={inputClass}>
            <option value="">합칠 활동을 고르세요…</option>
            {merges.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <span className="flex gap-2">
            <button type="submit" disabled={act.pending || mergeId === ""} className={buttonClass.primary}>합치기</button>
            <button type="button" className={buttonClass.secondary} onClick={close}>취소</button>
          </span>
        </form>
      )}

      {open === "split" && (
        <form className="flex flex-col gap-2 rounded-2xl border border-line p-3 text-sm" onSubmit={(e) => { e.preventDefault(); act.run(() => actions.split(node.id, splitName, [...splitFields], [...splitChildren]), (r) => { close(); if (r.ok && r.id) onSelect(r.id); }); }}>
          <p>고른 항목과 세부활동을 같은 위치의 새 활동으로 옮깁니다.</p>
          <input value={splitName} onChange={(e) => setSplitName(e.target.value)} placeholder="새 활동 이름" aria-label="새 활동 이름" maxLength={NODE_LIMITS.nameMaxChars} className={inputClass} />
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-muted">옮길 항목</legend>
            {(["situation", "task", "action", "result_conversation", "result_external"] as StarField[]).map((f) => (
              <label key={f} className="flex items-center gap-1"><input type="checkbox" checked={splitFields.has(f)} onChange={() => toggle(splitFields, setSplitFields, f)} />{STAR_FIELD_LABEL[f]}</label>
            ))}
          </fieldset>
          {subs.length > 0 && (
            <fieldset className="flex flex-wrap gap-3">
              <legend className="text-muted">옮길 세부활동</legend>
              {subs.map((s) => <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={splitChildren.has(s.id)} onChange={() => toggle(splitChildren, setSplitChildren, s.id)} />{s.name}</label>)}
            </fieldset>
          )}
          <span className="flex gap-2">
            <button type="submit" disabled={act.pending || splitName.trim() === "" || (splitFields.size === 0 && splitChildren.size === 0)} className={buttonClass.primary}>쪼개기</button>
            <button type="button" className={buttonClass.secondary} onClick={close}>취소</button>
          </span>
        </form>
      )}

      {open === "trash" && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line p-3 text-sm">
          <p>“{node.name}”{node.children.length > 0 ? "과 아래 노드를" : "을(를)"} 휴지통으로 보냅니다. 휴지통에서 복구할 수 있습니다.</p>
          <span className="flex gap-2">
            <button type="button" disabled={act.pending} className={buttonClass.danger} onClick={() => act.run(() => actions.trash(node.id), () => { close(); onSelect(null); })}>휴지통으로 보내기</button>
            <button type="button" className={buttonClass.secondary} onClick={close}>취소</button>
          </span>
        </div>
      )}
      <Message message={act.message} />
    </section>
  );
}
