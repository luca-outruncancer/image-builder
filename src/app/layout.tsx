import type React from "react"
import "@/app/globals.css"
import { Inter } from 'next/font/google';
import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
    <body className={cn(inter.className, 'relative min-h-full')}>
      <Header />
      <main className="pb-32">{children}</main>
      <Footer className="absolute bottom-0 w-full" />
    </body>
  </html>
  )
}