import type { Metadata } from "next";
import "./globals.css";

// 글꼴(Pretendard·Noto Serif KR·JetBrains Mono)은 npm 패키지를 globals.css에서 불러와 같은 서버에서 내보낸다(외부 호출 없음).

export const metadata: Metadata = {
  title: "Trail",
  description: "Claude 대화의 결정을 개념 트리로 모아 보는 개인용 기록 앱",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
