// STAR 문서 보기: 프로젝트·활동을 제출할 문서처럼 보여 준다. 로그인 후 문서 화면과 로그인 전 샘플이 같이 쓴다(읽기 전용, 상태 없음).
import { Badge } from "@/components/ui";
import type { DocNode, StarDocument } from "@/lib/rules/star-doc";

const period = (n: { startDate: string | null; endDate: string | null }) => (n.startDate || n.endDate ? `${n.startDate ?? "?"} ~ ${n.endDate ?? "?"}` : "");
const HEADINGS = ["h2", "h3", "h4", "h5", "h6", "h6"] as const;

function Node({ node, depth }: { node: DocNode; depth: number }) {
  const Heading = HEADINGS[Math.min(depth, HEADINGS.length - 1)];
  return (
    <section className="flex flex-col gap-3" aria-label={node.name}>
      <Heading className={depth === 0 ? "text-2xl" : depth === 1 ? "text-xl" : "text-lg"}>
        {node.name}
        {period(node) && <span className="ml-2 text-sm font-normal text-muted">{period(node)}</span>}
      </Heading>
      <p className="-mt-1"><Badge>{node.kindLabel}</Badge></p>
      {node.description.trim() && <p className="whitespace-pre-wrap text-sm text-muted">{node.description}</p>}
      {node.fields.map((f) => (
        <div key={f.field} className="flex flex-col gap-1">
          <p className="text-sm"><span className="font-semibold">{f.label}</span> <span className="text-xs text-muted">({f.subjectLabel})</span></p>
          <p className="whitespace-pre-wrap text-[15px]">{f.text}</p>
          {f.evidence.map((e, i) => (
            <p key={i} className="quote-block text-sm text-muted">“{e.excerpt}” <span className="text-xs text-subtle">— {e.conversationTitle}, {e.conversationDate}</span></p>
          ))}
        </div>
      ))}
      {node.outputs.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold">산출물</p>
          <ul className="flex flex-col gap-1">
            {node.outputs.map((o, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                {o.isFinal && <Badge tone="ok">최종</Badge>}
                {o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{o.name}</a> : <span>{o.name}</span>}
                {o.hasFile && <span className="text-xs text-subtle">첨부 파일 있음</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {node.children.length > 0 && (
        <div className="flex flex-col gap-6 border-l border-line pl-4 md:pl-6">
          {node.children.map((c) => <Node key={c.id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </section>
  );
}

export function StarDocumentView({ doc }: { doc: StarDocument }) {
  return (
    <article aria-label={`${doc.root.name} 문서`} className="flex flex-col gap-6 rounded-[1.75rem] bg-surface p-5 md:p-8">
      <Node node={doc.root} depth={0} />
      <p className="border-t border-line pt-3 text-xs text-subtle">활동 {doc.activityCount}개 · 비어 있는 항목은 쓰지 않았고, 제외·휴지통 노드는 뺐습니다.</p>
    </article>
  );
}
