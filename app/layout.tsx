import type { Metadata } from "next";
import "./globals.css";

// 글꼴은 기기의 시스템 글꼴을 쓴다(애플 기기는 SF Pro·애플 SD 고딕). 따로 내려받는 글꼴이 없어 빠르고 외부 호출도 없다.

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
