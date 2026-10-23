// 화면이 부르는 편집 동작 묶음. 로그인한 화면은 서버 액션(app/my/actions.ts)을 넘기고, 샘플 화면은 아무것도 넘기지 않아 읽기 전용이 된다.
import type { EditResult } from "@/lib/my/node-edit";

type Ev = { conversationTitle: string; conversationDate: string; excerpt: string };
type Out = { name: string; url?: string; isFinal?: boolean };

export type NodeActions = {
  create: (parentId: string | null, kind: string, name: string) => Promise<EditResult>;
  update: (id: string, patch: Record<string, string>) => Promise<EditResult>;
  move: (id: string, parentId: string | null) => Promise<EditResult>;
  unlock: (id: string, which: string) => Promise<EditResult>;
  trash: (id: string) => Promise<EditResult>;
  restore: (id: string) => Promise<EditResult>;
  purge: (id: string) => Promise<EditResult>;
  setField: (id: string, field: string, text: string, subject: string) => Promise<EditResult>;
  setSubject: (id: string, field: string, subject: string) => Promise<EditResult>;
  setLock: (id: string, field: string, locked: boolean) => Promise<EditResult>;
  addEvidence: (id: string, field: string, e: Ev) => Promise<EditResult>;
  updateEvidence: (evidenceId: string, e: Ev) => Promise<EditResult>;
  removeEvidence: (evidenceId: string) => Promise<EditResult>;
  resolveSuggestion: (suggestionId: string, mode: string) => Promise<EditResult>;
  addOutput: (id: string, o: Out) => Promise<EditResult>;
  updateOutput: (outputId: string, o: Out) => Promise<EditResult>;
  removeOutput: (outputId: string) => Promise<EditResult>;
  merge: (keepId: string, otherId: string) => Promise<EditResult>;
  split: (id: string, name: string, fields: string[], children: string[]) => Promise<EditResult>;
};
