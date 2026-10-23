import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";

// Glass Iris 디자인: 글꼴은 Inter Tight 하나(400·500·600). 한글은 기기에 있는 글꼴(애플 SD 고딕 등)로 보인다.
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: "Trail",
  description: "Claude 대화의 결정을 개념 트리로 모아 보는 개인용 기록 앱",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${interTight.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
