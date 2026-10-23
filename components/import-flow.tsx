"use client";

// Design Ref: PRD 5 should(과거 대화 업로드 추천) — ① 파일을 고르면 브라우저에서 대표 대화 요약만 뽑아 미리 보여 주고 ② 내가 "보내기"를 눌러야 Claude로 가며
// ③ 추천 후보를 내가 체크해서 승인한 것만 저장한다. 파일 전체는 서버로 가지 않는다.
import { useState, useTransition } from "react";
import { buildDigest, digestChars, type Digest } from "@/lib/rules/import-digest";
import type { Recommendation } from "@/lib/rules/recommendation";
import { recommend, saveApprovedItems } from "@/app/my/import/actions";

type Step = "pick" | "preview" | "pick-candidates" | "saved";

export function ImportFlow() {
  const [step, setStep] = useState<Step>("pick");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [fileInfo, setFileInfo] = useState("");
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [checkedTops, setCheckedTops] = useState<Set<string>>(new Set());
  const [checkedTopics, setCheckedTopics] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<{ tops: number; topics: number } | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File | undefined) {
    setMessage("");
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return setMessage("파일이 너무 큽니다(50MB 초과).");
    try {
      const raw = JSON.parse(await file.text());
      const d = buildDigest(raw);
      if (!d || d.conversations.length === 0) return setMessage("대화 기록(conversations.json) 모양이 아니거나, 내 말이 담긴 대화가 없습니다.");
      setDigest(d);
      setFileInfo(`${file.name} · 대화 ${Array.isArray(raw) ? raw.length : 0}개 중 ${d.conversations.length}개 선택`);
      setStep("preview");
    } catch {
      setMessage("파일을 읽지 못했습니다. conversations.json 파일이 맞는지 확인해 주세요.");
    }
  }

  function onSend() {
    if (!digest) return;
    start(async () => {
      const res = await recommend(digest);
      if (!res.ok) return setMessage(res.message);
      setRec(res.recommendation);
      setCheckedTops(new Set(res.recommendation.topConcepts.map((c) => c.name)));
      setCheckedTopics(new Set(res.recommendation.projectTopics.map((c) => c.name)));
      setMessage("");
      setStep("pick-candidates");
    });
  }

  function onSave() {
    start(async () => {
      const res = await saveApprovedItems([...checkedTops], [...checkedTopics]);
      if (!res.ok) return setMessage(res.message);
      setSaved({ tops: res.savedTopConcepts, topics: res.savedProjectTopics });
      setMessage("");
      setStep("saved");
    });
  }

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setter(next);
  };

  return (
    <section className="flex flex-col gap-5">
      {message && <p role="alert" className="text-sm text-danger">{message}</p>}

      {step === "pick" && (
        <label className="flex flex-col gap-2 text-sm font-medium">
          대화 기록 파일(conversations.json)
          <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          <span className="text-xs font-normal text-subtle">파일 전체는 서버로 올라가지 않습니다. 이 화면(브라우저) 안에서 대표 대화 일부만 뽑아 다음 단계에서 보여 드립니다.</span>
        </label>
      )}

      {step === "preview" && digest && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">{fileInfo} · {digestChars(digest).toLocaleString("ko-KR")}자</p>
          <p className="text-sm text-muted">아래 내용이 <strong>Claude API로 전송</strong>됩니다. 키·토큰처럼 보이는 글자는 자동으로 가렸지만 모든 모양을 잡지는 못합니다. 직접 훑어보고, 보내고 싶지 않은 내용이 있으면 다른 파일을 고르세요.</p>
          <ul className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-lg border border-line p-3 text-xs">
            {digest.conversations.map((c, i) => (
              <li key={i} className="flex flex-col gap-1">
                <strong>{c.name}</strong>
                {c.messages.map((m, j) => (
                  <span key={j} className="text-muted">· {m}</span>
                ))}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={onSend} disabled={pending} className="rounded-xl bg-brand px-5 py-2 text-sm font-medium text-on-accent disabled:opacity-50">
              {pending ? "추천 받는 중…" : "이 내용으로 추천 받기"}
            </button>
            <button type="button" onClick={() => { setStep("pick"); setDigest(null); }} className="rounded-xl border border-line-strong hover:bg-surface-hover px-5 py-2 text-sm">다른 파일</button>
          </div>
        </div>
      )}

      {step === "pick-candidates" && rec && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted">체크한 항목만 저장됩니다. 이미 있는 항목은 제외돼 있습니다.</p>
          <CandidateList title="상위 개념 후보" items={rec.topConcepts} checked={checkedTops} onToggle={(n) => toggle(checkedTops, setCheckedTops, n)} />
          <CandidateList title="프로젝트 주제 후보" items={rec.projectTopics} checked={checkedTopics} onToggle={(n) => toggle(checkedTopics, setCheckedTopics, n)} />
          <button type="button" onClick={onSave} disabled={pending || (checkedTops.size === 0 && checkedTopics.size === 0)} className="self-start rounded-xl bg-brand px-5 py-2 text-sm font-medium text-on-accent disabled:opacity-50">
            {pending ? "저장하는 중…" : "승인한 항목 저장"}
          </button>
        </div>
      )}

      {step === "saved" && saved && (
        <div className="flex flex-col gap-2 text-sm">
          <p role="status">저장했습니다. 상위 개념 {saved.tops}개, 프로젝트 주제 {saved.topics}개.</p>
          <p className="text-muted">프로젝트 주제는 Claude가 기록하기 전에 부르는 <code>list_cards</code>가 알려 주므로, 사용자 지침에 따로 붙여 넣지 않아도 됩니다.</p>
        </div>
      )}
    </section>
  );
}

function CandidateList({ title, items, checked, onToggle }: { title: string; items: { name: string; reason: string }[]; checked: Set<string>; onToggle: (name: string) => void }) {
  if (items.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      {items.map((c) => (
        <label key={c.name} className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={checked.has(c.name)} onChange={() => onToggle(c.name)} className="mt-1" />
          <span>
            {c.name}
            {c.reason && <span className="block text-xs text-subtle">{c.reason}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
