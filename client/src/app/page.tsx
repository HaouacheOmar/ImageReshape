import Link from "next/link";
import { Editor } from "@/components/Editor";
import { Hero } from "@/components/Hero";

export default function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-[1280px] items-center justify-between px-24 py-24">
        <Link href="/" className="flex items-center gap-12 text-nav-label font-normal">
          <svg viewBox="0 0 24 24" className="size-[22px]" aria-hidden="true">
            <defs>
              <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8052ff" />
                <stop offset="1" stopColor="#15846e" />
              </linearGradient>
            </defs>
            <path d="M12 2 22 20H2Z" fill="url(#logo)" />
          </svg>
          ImageReshape
        </Link>
        <nav className="flex gap-30 text-nav-label font-semibold uppercase tracking-nav-label">
          <a href="#editor" className="text-ash-gray transition-colors hover:text-bone-white">Editor</a>
        </nav>
      </header>
      <main>
        <Hero />
        <Editor />
      </main>
      <footer className="mx-auto max-w-[1280px] px-24 pb-60 text-caption leading-caption text-ash-gray">
        ImageReshape — crop, resize, remove background.
      </footer>
    </>
  );
}
