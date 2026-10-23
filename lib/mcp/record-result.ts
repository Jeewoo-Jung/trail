// Design Ref: PRD 5번(결과·최종 산출물 등록) — Claude 채팅 안에서 사용자가 말한 "외부 결과"와 최종 산출물을 활동에 저장한다.
// 앱 화면에서 입력해도 같은 항목(외부 결과)·같은 목록(산출물)이 갱신되므로 어느 쪽에서 넣어도 같은 데이터다.
//  - save: 사용자가 말한 외부 결과 글(300자 이하)을 저장한다. 사용자의 말을 옮긴 것이라 그 항목은 잠긴다. Claude가 지어낸 결과를 보내면 안 된다.
//  - not_applicable: 사용자가 "해당 없다/결과 없다"고 한 활동은 더 묻지 않는다.
//  - asked: 이 활동의 결과를 채팅에서 물었다고만 기록한다(활동당 최대 1회 질문을 지키려는 표시).
import { z } from "zod";
import { countChars } from "../rules/text";
import { NODE_LIMITS, STAR_LIMITS } from "../rules/limits";
import { maskSecrets } from "../rules/mask-secrets";
import { hasStar, isEffectivelyExcluded } from "../rules/nodes";
import type { NodeStore } from "./node-store";

export const recordResultSchema = z.object({
  nodeId: z.uuid(),
  action: z.enum(["save", "not_applicable", "asked"]),
  /** save일 때 사용자가 말한 외부 결과 */
  text: z.string().optional(),
  /** save일 때 사용자가 말한 최종 산출물(이름, 선택적으로 http(s) 링크) */
  outputs: z.array(z.object({ name: z.string(), url: z.string().optional() })).max(5).optional(),
});

export type RecordResultOutput = { status: "saved" | "marked" | "rejected"; nodeId: string; textSaved?: boolean; outputsAdded?: number; notes?: string[]; reasons?: string[] };
export type RecordResultOutcome = { ok: true; output: RecordResultOutput } | { ok: false; errors: string[] };

const mask = (t: string) => maskSecrets(t).text;
const isHttp = (u: string) => /^https?:\/\/\S+$/i.test(u);

export async function recordResult(store: NodeStore, rawInput: unknown): Promise<RecordResultOutcome> {
  const parsed = recordResultSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errors: [...new Set(parsed.error.issues.map((i) => `${i.path.map(String).join(".") || "입력"} 값이 없거나 형식이 올바르지 않습니다`))] };
  const input = parsed.data;
  const reject = (reason: string): RecordResultOutcome => ({ ok: true, output: { status: "rejected", nodeId: input.nodeId, reasons: [reason] } });

  const nodes = await store.listNodes();
  const node = nodes.find((n) => n.id === input.nodeId);
  if (!node || node.deletedAt) return reject("활동 id를 찾지 못했습니다.");
  if (!hasStar(node.kind)) return reject("활동이나 세부활동의 결과만 저장할 수 있습니다.");
  if (isEffectivelyExcluded(nodes, node.id)) return reject("제외된 노드라서 기록하지 않았습니다.");

  if (input.action === "asked") {
    await store.markResultAsked(node.id);
    return { ok: true, output: { status: "marked", nodeId: node.id } };
  }
  if (input.action === "not_applicable") {
    await store.setResultState(node.id, "not_applicable");
    return { ok: true, output: { status: "marked", nodeId: node.id } };
  }

  // save
  const notes: string[] = [];
  const text = input.text === undefined ? "" : mask(input.text).trim();
  if (countChars(text) > STAR_LIMITS.result_external) return reject(`외부 결과는 ${STAR_LIMITS.result_external}자 이하여야 합니다. 줄여서 다시 보내 주세요.`);
  const known = await store.listOutputs(node.id);
  let count = known.length;
  let added = 0;
  for (const o of input.outputs ?? []) {
    const name = mask(o.name).trim();
    const url = o.url ? mask(o.url).trim() : null;
    if (name === "" || countChars(name) > NODE_LIMITS.outputNameMaxChars) { notes.push("산출물 이름이 비었거나 너무 길어 건너뜁니다."); continue; }
    if (url !== null && (!isHttp(url) || countChars(url) > NODE_LIMITS.urlMaxChars)) { notes.push("산출물 링크 모양이 올바르지 않아 건너뜁니다."); continue; }
    if (known.some((k) => k.name === name && k.url === url)) continue;
    if (count >= NODE_LIMITS.outputsMaxCount) { notes.push(`산출물은 활동당 ${NODE_LIMITS.outputsMaxCount}개까지입니다.`); break; }
    await store.insertOutput(node.id, name, url, true);
    known.push({ name, url });
    count += 1;
    added += 1;
  }
  if (text === "" && added === 0) return reject("저장할 결과 글이나 산출물이 없습니다.");
  if (text !== "") await store.setResultText(node.id, text);
  await store.setResultState(node.id, "filled");
  return { ok: true, output: { status: "saved", nodeId: node.id, textSaved: text !== "", ...(added > 0 ? { outputsAdded: added } : {}), ...(notes.length > 0 ? { notes } : {}) } };
}
