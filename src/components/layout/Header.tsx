import Image from 'next/image';
import Link from 'next/link';

export default function Header() {
  return (
    <>
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-muted/50">
        <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none bg-clip-text text-transparent bg-gradient-to-r from-black to-muted-foreground">
          We believe in outrunning cancer.
        </h1>
        <p className="mx-auto max-w-[1500px] text-muted-foreground md:text-xl mt-6">
            Every $ raised through this visual board will go towards building OUTRUNCANCER 3.0. A new more effective
            way to raise awareness and funds for cancer prevention, by empowering and financially supporting
            individuals to raise funds, donate to specific prevention projects, and bring blockchain transparency
            across the board.        </p>
      </div>
    </>
  );
}