import { HOT } from "../lib/utils";
import { IArrowRight } from "./Icons";

export default function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-6 py-20">
      <div className="pointer-events-none absolute top-1/3 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-accent/[0.08] blur-[110px]" />
      <div className="relative max-w-xl text-center">
        <h1 className="font-serif text-[84px] leading-[0.9] tracking-[-0.03em] animate-rise sm:text-[128px]">
          blank<span className="text-accent">.</span>
          <span className="ml-1 inline-block h-[0.72em] w-[3px] translate-y-[0.06em] bg-accent align-baseline animate-blink" />
        </h1>
        <p className="mx-auto mt-6 text-[16px] leading-relaxed text-muted animate-rise" style={{ animationDelay: "100ms" }}>
          A quiet place for your thoughts. <span className="text-ink">Just start typing.</span>
        </p>

        <div className="mt-9 flex items-center justify-center gap-3 animate-rise" style={{ animationDelay: "180ms" }}>
          <button
            onClick={onCreate}
            className="group inline-flex h-11 items-center gap-2 rounded-full bg-ink pr-3 pl-6 text-[14px] font-medium text-bg transition-transform hover:scale-[1.03] active:scale-95"
          >
            New note
            <span className="grid h-7 w-7 place-items-center rounded-full bg-bg/15 transition-transform group-hover:translate-x-0.5">
              <IArrowRight size={14} />
            </span>
          </button>
          <kbd className="hidden rounded-lg border border-line px-2 py-1 text-[11px] text-faint sm:block">{HOT} N</kbd>
        </div>
      </div>
    </div>
  );
}
