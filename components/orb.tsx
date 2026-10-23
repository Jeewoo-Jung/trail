// Glass Iris의 "살아 있는 유리 구슬": 영상 없이 CSS만으로 그린다. 파랑·보라 핵이 천천히 돌고 숨 쉬듯 밝아진다.
// 움직임 줄이기 설정이면 멈춘 그림만 보인다(globals.css).
export function Orb({ size = 112 }: { size?: number }) {
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: size, height: size }}>
      {/* 바깥 빛 번짐 */}
      <div className="orb-pulse absolute -inset-6 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(64,110,255,0.45), rgba(124,72,240,0.18) 55%, transparent 75%)", animation: "orb-pulse 4s ease-in-out infinite" }} />
      {/* 유리 구 */}
      <div className="absolute inset-0 overflow-hidden rounded-full" style={{ background: "radial-gradient(circle at 50% 35%, #1b2a5c, #0b0f22 70%)", boxShadow: "inset 0 0 18px rgba(120,160,255,0.35), 0 0 30px rgba(47,107,255,0.35)", border: "1px solid rgba(160,190,255,0.25)" }}>
        {/* 돌아가는 핵 */}
        <div className="orb-spin absolute inset-[12%] rounded-full blur-[10px]" style={{ background: "conic-gradient(from 0deg, #2f6bff, #7c48f0, #38bdf8, #5a4cf5, #2f6bff)", animation: "orb-spin 12s linear infinite" }} />
        {/* 유리의 반사 */}
        <div className="absolute left-[16%] top-[8%] h-[34%] w-[56%] rounded-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))", filter: "blur(2px)" }} />
        <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 50% 120%, rgba(255,255,255,0.18), transparent 50%)" }} />
      </div>
    </div>
  );
}
