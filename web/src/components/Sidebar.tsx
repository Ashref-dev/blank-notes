import { useMemo, useRef, useState } from "react";
import { cn } from "../utils/cn";
import { HOT, MOD, type Note, displayTitle, groupOf, relTime, snippet } from "../lib/utils";
import { useNow } from "../hooks/misc";
import { ICommand, IMoon, IPin, IPlus, ISearch, ISun, ITrash, IX } from "./Icons";

type Props = {
  open: boolean;
  isMobile: boolean;
  notes: Note[];
  activeId: string | null;
  theme: "light" | "dark";
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onClose: () => void;
  onPalette: () => void;
  onTheme: (o: { x: number; y: number }) => void;
};

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif text-[26px] leading-none tracking-tight select-none", className)}>
      blank<span className="text-accent">.</span>
    </span>
  );
}

export default function Sidebar(p: Props) {
  const [q, setQ] = useState("");
  const now = useNow(30000);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return p.notes;
    return p.notes.filter((n) => (n.title + " " + n.body).toLowerCase().includes(s));
  }, [q, p.notes]);

  const groups = useMemo(() => {
    const out: { label: string; items: Note[] }[] = [];
    for (const n of filtered) {
      const g = groupOf(n, now);
      const last = out[out.length - 1];
      if (last && last.label === g) last.items.push(n);
      else out.push({ label: g, items: [n] });
    }
    return out;
  }, [filtered, now]);

  return (
    <>
      {/* mobile scrim */}
      {p.isMobile && (
        <div
          onClick={p.onClose}
          className={cn(
            "fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300",
            p.open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
      )}
      <aside
        className={cn(
          "z-40 flex h-full shrink-0 flex-col overflow-hidden bg-panel transition-[width,transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          p.isMobile
            ? cn("fixed inset-y-0 left-0 w-[86vw] max-w-[320px] shadow-soft", p.open ? "translate-x-0" : "-translate-x-full")
            : cn("relative border-r border-line", p.open ? "w-[288px] opacity-100" : "w-0 opacity-0")
        )}
      >
        <div className="flex w-[288px] max-w-full flex-1 flex-col min-h-0">
          {/* brand */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <a href="#" onClick={(e) => e.preventDefault()} className="group flex items-baseline gap-2">
              <Logo />
              <span className="font-mono text-[10.5px] tracking-wide text-faint transition-colors group-hover:text-muted">
                achraf.tn
              </span>
            </a>
            <div className="flex items-center gap-1">
              <button
                onClick={p.onCreate}
                title={`New note (${HOT} N)`}
                className="group relative grid h-8 w-8 place-items-center rounded-full bg-ink text-bg transition-all duration-300 hover:scale-105 hover:rotate-90 active:scale-95"
              >
                <IPlus size={16} />
              </button>
              {p.isMobile && (
                <button onClick={p.onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-ink/5">
                  <IX size={16} />
                </button>
              )}
            </div>
          </div>

          {/* search */}
          <div className="px-3 pb-3">
            <label className="group flex h-9 items-center gap-2 rounded-xl border border-transparent bg-ink/[0.04] px-3 text-muted transition-all focus-within:border-line focus-within:bg-elev focus-within:shadow-soft">
              <ISearch size={15} className="shrink-0 transition-colors group-focus-within:text-accent" />
              <input
                ref={searchRef}
                id="note-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setQ(""), searchRef.current?.blur())}
                placeholder="Search notes"
                className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint"
              />
              {q ? (
                <button onClick={() => setQ("")} className="text-faint hover:text-ink animate-pop">
                  <IX size={13} />
                </button>
              ) : (
                <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] text-faint sm:block">/</kbd>
              )}
            </label>
          </div>

          {/* list */}
          <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
            {groups.length === 0 && (
              <div className="mt-16 px-6 text-center animate-fade">
                <p className="font-serif text-2xl italic text-muted">{q ? "Nothing found." : "No notes yet."}</p>
                <p className="mt-2 text-[12.5px] text-faint">
                  {q ? "Try a different word." : "Your thoughts will gather here."}
                </p>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label} className="mb-3">
                <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{g.label}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <ul className="space-y-0.5">
                  {g.items.map((n, i) => {
                    const active = n.id === p.activeId;
                    const snip = snippet(n);
                    return (
                      <li key={n.id} className="animate-slide" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => p.onSelect(n.id)}
                          onKeyDown={(e) => e.key === "Enter" && p.onSelect(n.id)}
                          className={cn(
                            "group relative cursor-pointer rounded-xl px-3 py-2.5 outline-none transition-all duration-200",
                            active ? "bg-elev shadow-soft" : "hover:bg-ink/[0.035] focus-visible:bg-ink/[0.035]"
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-1/2 left-0 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-all duration-300",
                              active ? "h-5 opacity-100" : "h-0 opacity-0"
                            )}
                          />
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {n.pinned && <IPin size={11} filled className="shrink-0 text-accent" />}
                                <p
                                  className={cn(
                                    "truncate text-[13.5px] font-medium transition-colors",
                                    active ? "text-ink" : "text-ink/85",
                                    !n.title.trim() && !n.body.trim() && "italic text-faint"
                                  )}
                                >
                                  {displayTitle(n)}
                                </p>
                              </div>
                              <p className="mt-0.5 truncate text-[12px] text-muted">
                                <span className="text-faint">{relTime(n.updatedAt, now)}</span>
                                {snip && <span> · {snip}</span>}
                              </p>
                            </div>
                            <div className="flex shrink-0 translate-x-1 items-center gap-0.5 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 max-md:translate-x-0 max-md:opacity-100">
                              <button
                                onClick={(e) => (e.stopPropagation(), p.onPin(n.id))}
                                title={n.pinned ? "Unpin" : "Pin"}
                                className={cn(
                                  "grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-ink/5",
                                  n.pinned ? "text-accent" : "text-faint hover:text-ink"
                                )}
                              >
                                <IPin size={13} filled={n.pinned} />
                              </button>
                              <button
                                onClick={(e) => (e.stopPropagation(), p.onDelete(n.id))}
                                title="Delete"
                                className="grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-red-500/10 hover:text-red-500"
                              >
                                <ITrash size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* footer */}
          <div className="border-t border-line px-3 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={p.onPalette}
                className="flex h-9 flex-1 items-center gap-2 rounded-xl px-3 text-[12.5px] text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
              >
                <ICommand size={14} />
                <span>Commands</span>
                <kbd className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10px] text-faint">{MOD} K</kbd>
              </button>
              <button
                onClick={(e) => p.onTheme({ x: e.clientX, y: e.clientY })}
                title="Toggle theme"
                className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
              >
                <ISun
                  size={16}
                  className={cn("absolute transition-all duration-500", p.theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100")}
                />
                <IMoon
                  size={16}
                  className={cn("absolute transition-all duration-500", p.theme === "dark" ? "rotate-0 scale-100" : "-rotate-90 scale-0 opacity-0")}
                />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
