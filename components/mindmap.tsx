"use client";

// Design Ref: DESIGN.md §12 — 옵시디언 그래프 보기를 따른다: 어두운 바탕에 회색 점과 가는 선, 점마다 힘으로 자리 잡기,
// 끌어서 이동·휠로 확대·점 끌기, 마우스를 올리면 그 점과 이웃만 밝히기, 검색, 라벨 보이기 조절.
// 읽기 전용이다. 노드를 누르면 트리 화면과 같은 카드 상세가 옆에 보이고, 승인·거절·삭제는 트리 화면에서만 한다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardItem } from "@/components/concept-tree";
import { buildGraph, defaultCollapsedGraph, fitTransform, groupColor, neighborsOf, tickGraph, zoomAt, type Graph, type ViewTransform } from "@/lib/rules/graph-layout";
import { cardsOfNode, findNode, type ConceptNode } from "@/lib/rules/tree";

// 화면 크기를 재기 전(첫 그림)에 쓰는 기본 크기. 실제 크기는 ResizeObserver가 잰다.
const DEFAULT_W = 900;
const DEFAULT_H = 640;
type LabelMode = "auto" | "always" | "off";

export function Mindmap({ tree }: { tree: ConceptNode[] }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => defaultCollapsedGraph(tree));
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState<LabelMode>("auto");
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const sizeRef = useRef(size);
  const [view, setView] = useState<ViewTransform>({ k: 1, x: DEFAULT_W / 2, y: DEFAULT_H / 2 });
  // 계산(graphRef)은 매 프레임 직접 고쳐 쓰고, 화면은 그 복사본(snapshot)만 읽어서 그린다.
  const [snapshot, setSnapshot] = useState<Graph>({ nodes: [], edges: [] });
  const graphRef = useRef<Graph>({ nodes: [], edges: [] });
  const autoFit = useRef(true); // 내가 끌거나 확대하기 전까지는 점들이 자리 잡는 동안 화면에 계속 맞춘다
  const [panelOpen, setPanelOpen] = useState(false);
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ type: "pan" | "node"; id?: string; lastX: number; lastY: number; moved: boolean } | null>(null);

  // 그림 영역의 실제 크기를 재서 viewBox에 쓴다(가로세로 비율이 달라 위아래가 비는 것을 막는다).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        sizeRef.current = { w: width, h: height };
        setSize({ w: width, h: height });
        if (autoFit.current) setView(fitTransform(graphRef.current, width, height)); // 크기가 바뀌면 자동 맞춤도 다시 한다
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const loop = () => {
      const speed = tickGraph(graphRef.current, alphaRef.current);
      alphaRef.current = Math.max(0.02, alphaRef.current * 0.985);
      if (autoFit.current) setView(fitTransform(graphRef.current, sizeRef.current.w, sizeRef.current.h));
      setSnapshot({ nodes: graphRef.current.nodes.map((n) => ({ ...n })), edges: graphRef.current.edges });
      // 거의 멈추고 끌고 있는 점도 없으면 계산을 쉰다(배터리·성능)
      if (speed < 0.05 && alphaRef.current <= 0.03 && drag.current?.type !== "node") {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // 트리가 바뀌거나 접기/펼치기가 바뀌면 점을 다시 만들되, 있던 점은 그 자리에서 이어 간다.
  useEffect(() => {
    const prev = new Map(graphRef.current.nodes.map((n) => [n.key, { x: n.x, y: n.y }]));
    // 내가 아직 화면을 만지지 않았다면(개발 모드가 효과를 두 번 돌려도) 처음처럼 자리 잡고 화면에 맞춘다.
    const first = prev.size === 0 || autoFit.current;
    graphRef.current = buildGraph(tree, collapsed, prev);
    alphaRef.current = first ? 1 : 0.6;
    if (first) {
      // 첫 화면은 미리 자리를 잡아 두고(깜빡임 없이) 화면에 맞춘다.
      for (let i = 0; i < 180; i += 1) tickGraph(graphRef.current, Math.max(0.05, 1 - i / 180));
      autoFit.current = true;
      alphaRef.current = 0.15;
    }
    startLoop();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [tree, collapsed, startLoop]);

  const graph = snapshot;
  const active = hover ?? selected;
  const near = useMemo(() => (active ? neighborsOf(graph, active) : null), [graph, active]);
  const q = query.trim().toLowerCase();
  const matches = q ? new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)) : null;

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return { sx, sy, wx: (sx - view.x) / view.k, wy: (sy - view.y) / view.k };
  };

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const target = (e.target as Element).closest("[data-node]") as SVGElement | null;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    autoFit.current = false;
    if (target) {
      const id = target.dataset.node!;
      const n = graphRef.current.nodes.find((x) => x.id === id);
      if (n) n.pinned = true;
      drag.current = { type: "node", id, lastX: e.clientX, lastY: e.clientY, moved: false };
      alphaRef.current = Math.max(alphaRef.current, 0.4);
      startLoop();
    } else {
      drag.current = { type: "pan", lastX: e.clientX, lastY: e.clientY, moved: false };
    }
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    if (Math.abs(e.clientX - d.lastX) + Math.abs(e.clientY - d.lastY) > 2) d.moved = true;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    if (d.type === "pan") setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    else {
      const n = graphRef.current.nodes.find((x) => x.id === d.id);
      if (n) { n.x += dx / view.k; n.y += dy / view.k; }
    }
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.type === "node") {
      const n = graphRef.current.nodes.find((x) => x.id === d.id);
      if (n) n.pinned = false;
      if (!d.moved) setSelected((cur) => (cur === d.id ? null : d.id!)); // 끌지 않고 눌렀으면 선택
      startLoop();
    } else if (!d.moved) setSelected(null); // 빈 곳을 누르면 선택 해제(= 전체 보기)
  }
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    autoFit.current = false;
    const { sx, sy } = toWorld(e.clientX, e.clientY);
    setView((v) => zoomAt(v, e.deltaY < 0 ? 1.12 : 1 / 1.12, sx, sy));
  }

  const toggleFold = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const cards = cardsOfNode(tree, selected);
  const selectedNode = graph.nodes.find((n) => n.id === selected);
  // 자식이 있는 개념을 고르면 접기/펼치기 버튼을 보여 준다(어느 단계든 접을 수 있다).
  const foldable = selected ? findNode(tree, selected) : null;
  const selectedTop = foldable && foldable.children.length > 0 ? foldable : null;
  const showLabel = (id: string) => {
    if (labels === "off") return false;
    if (labels === "always") return true;
    return view.k >= 0.85 || id === active || (near?.has(id) ?? false) || (matches?.has(id) ?? false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-[#0a0a0a]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="group"
          aria-label="개념 그래프"
          className="block h-[70vh] min-h-[420px] w-full touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {graph.edges.map((e) => {
              const a = graph.nodes.find((n) => n.id === e.source);
              const b = graph.nodes.find((n) => n.id === e.target);
              if (!a || !b) return null;
              const lit = near ? near.has(a.id) && near.has(b.id) : true;
              return <line key={`${e.source}>${e.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit && near ? groupColor(a.group) : "#3a3d45"} strokeOpacity={near ? (lit ? 0.9 : 0.1) : 0.7} strokeWidth={lit && near ? 1.8 / view.k + 0.4 : 1.2 / view.k + 0.3} />;
            })}
            {graph.nodes.map((n) => {
              const dim = (near && !near.has(n.id)) || (matches && !matches.has(n.id));
              const isSel = selected === n.id;
              const color = n.kind === "top" ? groupColor(n.group) : "#8c8c8c";
              return (
                <g
                  key={n.id}
                  data-node={n.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.label} ${n.count}장${n.proposed ? " (제안)" : ""}${n.hidden ? ` 하위 ${n.hidden}개 접힘` : ""}`}
                  aria-pressed={isSel}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected((cur) => (cur === n.id ? null : n.id)); }
                  }}
                  opacity={dim ? 0.18 : 1}
                  className="cursor-pointer outline-none"
                >
                  <circle cx={n.x} cy={n.y} r={n.r + 8} fill="transparent" />
                  <circle
                    cx={n.x} cy={n.y} r={n.r}
                    fill={n.proposed ? "none" : color}
                    stroke={isSel ? "#ffffff" : n.proposed ? "#e3b05a" : "none"}
                    strokeWidth={(isSel ? 2.4 : 1.8) / view.k + 0.2}
                    strokeDasharray={n.proposed && !isSel ? "3 2" : undefined}
                  />
                  {n.hidden > 0 && <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" stroke={color} strokeOpacity={0.5} strokeDasharray="2 3" strokeWidth={1 / view.k + 0.3} />}
                  {showLabel(n.id) && (
                    <text x={n.x} y={n.y + n.r + 13 / view.k + 2} textAnchor="middle" fontSize={Math.max(11, 12 / view.k)} fill={isSel || n.id === active ? "#faf9f5" : "#c2c0b6"} className="pointer-events-none">
                      {n.label}{n.hidden ? ` (+${n.hidden})` : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* 옵시디언의 그래프 설정 패널처럼 오른쪽 위에 떠 있는 작은 조절판 */}
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-label="그래프 설정 열기·닫기"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface/90 text-muted backdrop-blur hover:text-fg"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
          </svg>
        </button>
        {panelOpen && <div className="absolute right-3 top-14 flex w-56 flex-col gap-2 rounded-xl border border-line bg-surface/95 p-3 text-xs backdrop-blur">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="개념 검색…"
            aria-label="개념 검색"
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm"
          />
          <label className="flex items-center justify-between gap-2 text-muted">
            라벨
            <select value={labels} onChange={(e) => setLabels(e.target.value as LabelMode)} className="rounded-md border border-line bg-surface px-1.5 py-1 text-fg">
              <option value="auto">자동</option>
              <option value="always">항상</option>
              <option value="off">숨김</option>
            </select>
          </label>
          <div className="flex gap-1.5">
            <button type="button" aria-label="확대" onClick={() => setView((v) => zoomAt(v, 1.25, size.w / 2, size.h / 2))} className="flex-1 rounded-lg border border-line py-1 text-muted hover:bg-surface-hover">＋</button>
            <button type="button" aria-label="축소" onClick={() => setView((v) => zoomAt(v, 0.8, size.w / 2, size.h / 2))} className="flex-1 rounded-lg border border-line py-1 text-muted hover:bg-surface-hover">－</button>
            <button type="button" onClick={() => { autoFit.current = false; setView(fitTransform(graph, size.w, size.h)); }} className="flex-[2] rounded-lg border border-line py-1 text-muted hover:bg-surface-hover">화면에 맞추기</button>
          </div>
        </div>}
        <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-subtle">드래그: 이동 · 휠: 확대·축소 · 점을 끌거나 눌러 보세요</p>
      </div>

      <section aria-label="선택한 개념의 카드" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl">{selectedNode?.label ?? "전체"}</h2>
          {selectedTop && (
            <button type="button" onClick={() => toggleFold(selectedTop.key)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:bg-surface-hover">
              {collapsed.has(selectedTop.key) ? "하위 개념 펼치기" : "하위 개념 접기"}
            </button>
          )}
        </div>
        {cards.length === 0 ? <p className="text-sm text-subtle">이 개념에는 카드가 없습니다.</p> : cards.map((card) => <CardItem key={card.id} card={card} />)}
      </section>
    </div>
  );
}
