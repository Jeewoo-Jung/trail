// Trail 로고: 길(trail) 위에 놓인 점들과 가지. 한 가지 색(currentColor)이라 어느 바탕에서나 쓴다.
// Claude·Anthropic의 로고와 닮지 않게 선과 점만으로 그렸다.
export function TrailMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 18.5 11 11.5 19 5.5M11 11.5 18.5 17" />
      <circle cx="5" cy="18.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="11.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
