// src/app/layout.tsx
import RainingLettersLayout from '@/components/layout/RainingLettersLayout';
import Header from '@/components/layout/Header';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <RainingLettersLayout>
          <Header />
          {children}
        </RainingLettersLayout>
      </body>
    </html>
  );
}