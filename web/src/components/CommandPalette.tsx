import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../utils/cn";
import { ISearch } from "./Icons";

export type Command = {
  id: string;
  group: "Actions" | "Notes";
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  shortcut?: string;
  run: () => void;
};

function score(q: string, text: string) {
  if (!q) return 1;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx;
  // subsequence match
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 10 : 0;
}

export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [closing, setClosing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const scored = commands
      .map((c) => ({ c, s: score(s, `${c.label} ${c.keywords ?? ""} ${c.hint ?? ""}`) }))
      .filter((x) => x.s > 0);
    if (s) scored.sort((a, b) => b.s - a.s);
    const actions = scored.filter((x) => x.c.group === "Actions").map((x) => x.c);
    const notes = scored.filter((x) => x.c.group === "Notes").map((x) => x.c);
    return s ? [...notes.slice(0, 8), ...actions] : [...actions, ...notes.slice(0, 8)];
  }, [q, commands]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 150);
  };

  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    // let the palette unmount before running (focus handoff)
    requestAnimationFrame(() => c.run());
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (s + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (s - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh] sm:pt-[18vh]">
      <div onClick={close} className={cn("absolute inset-0 bg-black/20 backdrop-blur-[3px] transition-opacity duration-150", closing ? "opacity-0" : "animate-fade")} />
      <div
        className={cn(
          "relative w-full max-w-[560px] overflow-hidden rounded-[20px] border border-line bg-elev/95 shadow-soft backdrop-blur-2xl transition-all duration-150",
          closing ? "scale-[0.98] opacity-0" : "animate-scale-in"
        )}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-3 border-b border-line px-5">
          <ISearch size={17} className="text-accent" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes or type a command…"
            className="h-14 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-faint">esc</kbd>
        </div>
        <div ref={listRef} className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="font-serif text-xl italic text-muted">Nothing matches “{q}”</p>
              <p className="mt-1 text-[12px] text-faint">Try another word.</p>
            </div>
          )}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <div className="px-3 pt-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{header}</div>}
                <button
                  data-idx={i}
                  onMouseMove={() => sel !== i && setSel(i)}
                  onClick={() => run(c)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100",
                    sel === i ? "bg-ink/[0.055] text-ink" : "text-ink/80"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors",
                      sel === i ? "border-accent/30 bg-accent/10 text-accent" : "border-line text-muted"
                    )}
                  >
                    {c.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{c.label}</span>
                    {c.hint && <span className="block truncate text-[11.5px] text-muted">{c.hint}</span>}
                  </span>
                  {c.shortcut && <kbd className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-faint">{c.shortcut}</kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[11px] text-faint">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-line px-1">↑</kbd>
            <kbd className="rounded border border-line px-1">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-line px-1">↵</kbd> select
          </span>
          <span className="ml-auto font-serif text-[14px] italic text-muted">
            blank<span className="text-accent">.</span>
          </span>
        </div>
      </div>
    </div>
  );
}
