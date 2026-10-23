// 샘플 시험이 규칙 함수를 한 곳에서 가져다 쓰도록 모아 둔 얇은 통로
import { refsOf, type NodeRow } from "../rules/node-tree";
export { checkField, documentNodeIds, hasStar } from "../rules/nodes";
export const refsOnly = (nodes: NodeRow[]) => refsOf(nodes);
