// Design Ref: PRD 5 should(과거 대화 업로드 추천) — 내보내기 파일(conversations.json)을 통째로 서버에 보내지 않고,
// 브라우저에서 "대표 대화 일부의 이름과 내 말 앞부분"만 뽑은 요약으로 줄인다. 이 요약만 Claude에게 가고, 보내기 전에 내가 미리 본다.
import { z } from "zod";
import { countChars } from "./card";
import { maskSecrets } from "./mask-secrets";

export const DIGEST_LIMITS = {
  maxConversations: 10,
  maxMessagesPerConversation: 6,
  maxCharsPerMessage: 300,
  maxNameChars: 100,
  maxTotalChars: 12_000,
} as const;

export type Digest = { conversations: { name: string; messages: string[] }[] };

const oneLine = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const clip = (s: string, max: number) => (countChars(s) > max ? `${Array.from(s).slice(0, max - 1).join("")}…` : s);

type RawMessage = { sender?: unknown; text?: unknown; content?: unknown };

/** 내 말(human)의 본문만 꺼낸다. 본문은 text 필드, 없으면 text 블록을 이어 붙인다. */
function humanTexts(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  const out: string[] = [];
  for (const m of messages as RawMessage[]) {
    if (m?.sender !== "human") continue;
    let text = typeof m.text === "string" ? m.text : "";
    if (text.trim() === "" && Array.isArray(m.content)) {
      text = m.content.filter((b): b is { type: string; text: string } => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join(" ");
    }
    text = oneLine(maskSecrets(text).text);
    if (text !== "") out.push(text);
  }
  return out;
}

/** 대화 목록에서 대표 대화를 골라 요약을 만든다. conversations.json 모양이 아니면 null. */
export function buildDigest(raw: unknown): Digest | null {
  if (!Array.isArray(raw)) return null;
  const candidates = raw
    .map((c: { name?: unknown; created_at?: unknown; chat_messages?: unknown }) => ({
      name: typeof c?.name === "string" ? oneLine(c.name) : "",
      createdAt: typeof c?.created_at === "string" ? c.created_at : "",
      texts: humanTexts(c?.chat_messages),
    }))
    .filter((c) => c.texts.length > 0);
  if (!Array.isArray(raw) || (raw.length > 0 && !raw.some((c) => c && typeof c === "object" && "chat_messages" in c))) return null;

  // 내 말이 많은 대화(주제가 깊은 대화)를 먼저, 같으면 최근 것을 먼저 고른다.
  candidates.sort((a, b) => b.texts.length - a.texts.length || (a.createdAt < b.createdAt ? 1 : -1));

  const conversations: Digest["conversations"] = [];
  let total = 0;
  for (const c of candidates.slice(0, DIGEST_LIMITS.maxConversations)) {
    const name = clip(c.name || "(이름 없음)", DIGEST_LIMITS.maxNameChars);
    const messages: string[] = [];
    total += countChars(name);
    for (const t of c.texts.slice(0, DIGEST_LIMITS.maxMessagesPerConversation)) {
      const piece = clip(t, DIGEST_LIMITS.maxCharsPerMessage);
      if (total + countChars(piece) > DIGEST_LIMITS.maxTotalChars) break;
      messages.push(piece);
      total += countChars(piece);
    }
    if (messages.length > 0) conversations.push({ name, messages });
    if (total >= DIGEST_LIMITS.maxTotalChars) break;
  }
  return { conversations };
}

export const digestSchema = z.object({
  conversations: z
    .array(
      z.object({
        name: z.string().max(DIGEST_LIMITS.maxNameChars * 4),
        messages: z.array(z.string().max(DIGEST_LIMITS.maxCharsPerMessage * 4)).max(DIGEST_LIMITS.maxMessagesPerConversation),
      }),
    )
    .max(DIGEST_LIMITS.maxConversations),
});

/** 서버에서 요약을 다시 검사한다. 브라우저가 보낸 값이므로 한도를 서버에서도 지킨다. */
export function checkDigest(raw: unknown): Digest | null {
  const parsed = digestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const conversations = parsed.data.conversations.map((c) => ({
    name: clip(oneLine(maskSecrets(c.name).text), DIGEST_LIMITS.maxNameChars),
    messages: c.messages.map((m) => clip(oneLine(maskSecrets(m).text), DIGEST_LIMITS.maxCharsPerMessage)).filter((m) => m !== ""),
  }));
  const total = conversations.reduce((s, c) => s + countChars(c.name) + c.messages.reduce((t, m) => t + countChars(m), 0), 0);
  if (total > DIGEST_LIMITS.maxTotalChars + DIGEST_LIMITS.maxConversations * DIGEST_LIMITS.maxNameChars) return null;
  const nonEmpty = conversations.filter((c) => c.messages.length > 0);
  return nonEmpty.length > 0 ? { conversations: nonEmpty } : null;
}

export function digestChars(d: Digest): number {
  return d.conversations.reduce((s, c) => s + countChars(c.name) + c.messages.reduce((t, m) => t + countChars(m), 0), 0);
}
