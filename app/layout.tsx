import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

// Claude 화면처럼 본문은 산세리프(Inter), 제목은 세리프(Newsreader)로 쓴다. 한글은 기기에 있는 글꼴(애플 SD 고딕·애플명조 등)로 보인다.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Trail",
  description: "Claude 대화의 결정을 개념 트리로 모아 보는 개인용 기록 앱",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
