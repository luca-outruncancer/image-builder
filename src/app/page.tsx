// src/app/page.tsx
import Canvas from '@/components/canvas/Canvas';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 p-8">
        <div className="h-[85vh] w-[95vw] overflow-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 mx-auto">
          <Canvas className="mx-auto" />
        </div>
      </main>
    </div>
  );
}