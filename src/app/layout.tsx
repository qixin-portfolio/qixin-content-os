import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "齐鑫 Content OS",
  description: "本地优先、证据驱动的个人内容分发中台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
