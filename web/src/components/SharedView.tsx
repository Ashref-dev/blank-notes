import { useEffect, useState } from "react";
import { cn } from "../utils/cn";
import { type SharedResult, fetchShared, presentShared } from "../lib/api";
import { copyText, countdown, formatDateTime, wordCount } from "../lib/utils";
import { useNow } from "../hooks/misc";
import { toast } from "../lib/toast";
import { Logo } from "./Sidebar";
import { IArrowRight, ICheck, ICopy, IDownload, IHourglass, ILock, IMoon, ISun } from "./Icons";

type Props = {
  id: string;
  theme: "light" | "dark";
  onTheme: (o: { x: number; y: number }) => void;
  onSave: (note: { title: string; body: string }) => void;
  onExit: () => void;
};

type State = { status: "loading" } | SharedResult;

const MESSAGES = {
  notfound: {
    icon: "lock",
    title: (
      <>
        This link is <em className="text-muted">broken.</em>
      </>
    ),
    text: "There's no note here. It may have been mistyped, or it expired and was cleaned up. Ask the sender for a fresh link.",
  },
  expired: {
    icon: "hourglass",
    title: (
      <>
        This note has <em className="text-muted">faded.</em>
      </>
    ),
    text: "Its author chose for it to disappear. Some thoughts are only meant for a moment.",
  },
  disabled: {
    icon: "lock",
    title: (
      <>
        Sharing is <em className="text-muted">resting.</em>
      </>
    ),
    text: "Shared notes can't be opened right now. Please try again a little later.",
  },
  error: {
    icon: "lock",
    title: (
      <>
        Couldn't <em className="text-muted">reach it.</em>
      </>
    ),
    text: "The note didn't load. Check your connection and try again.",
  },
} as const;

export default function SharedView({ id, theme, onTheme, onSave, onExit }: Props) {
  const now = useNow(1000);
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchShared(id).then((r) => alive && setState(r));
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  const note = state.status === "ok" ? state.note : null;
  const view = note ? presentShared(note) : null;
  const expiresAt = note?.expiresAt ? Date.parse(note.expiresAt) : null;
  const left = expiresAt !== null ? expiresAt - now : null;
  const status = note && left !== null && left <= 0 ? "expired" : state.status;

  const viewTitle = view?.title;
  useEffect(() => {
    if (viewTitle !== undefined) document.title = `${viewTitle || "Shared note"} — blank.`;
    else if (status !== "loading") document.title = "Shared note — blank.";
  }, [viewTitle, status]);

  const copy = async () => {
    if (!view) return;
    const ok = await copyText((view.title ? view.title + "\n\n" : "") + view.body);
    if (!ok) return toast({ message: "Couldn't copy the text", icon: "info" });
    setCopied(true);
    toast({ message: "Text copied", icon: "check" });
    setTimeout(() => setCopied(false), 1800);
  };

  const header = (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/75 px-5 py-3.5 backdrop-blur-xl sm:px-8">
      <button onClick={onExit} className="group flex items-baseline gap-2">
        <Logo />
        <span className="font-mono text-[10.5px] text-faint transition-colors group-hover:text-muted">achraf.tn</span>
      </button>
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => onTheme({ x: e.clientX, y: e.clientY })}
          aria-label="Toggle theme"
          className="relative grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <ISun size={16} className={cn("absolute transition-all duration-500", theme === "dark" ? "rotate-90 scale-0" : "")} />
          <IMoon size={16} className={cn("absolute transition-all duration-500", theme === "dark" ? "" : "-rotate-90 scale-0")} />
        </button>
        <button
          onClick={onExit}
          className="group flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-bg transition-transform active:scale-95"
        >
          <span className="hidden sm:inline">Write your own</span>
          <span className="sm:hidden">Write</span>
          <IArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  );

  if (status === "loading") {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="grid flex-1 place-items-center" aria-busy="true" aria-label="Loading shared note">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
          </div>
        </div>
      </div>
    );
  }

  if (status !== "ok" || !view || !note) {
    const m = MESSAGES[status === "ok" ? "error" : status];
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="relative grid flex-1 place-items-center overflow-hidden px-6">
          <div className="pointer-events-none absolute top-1/2 left-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[100px]" />
          <div className="relative max-w-md text-center animate-rise">
            <div className="mx-auto mb-8 grid h-16 w-16 place-items-center rounded-3xl border border-line bg-elev text-accent shadow-soft animate-float">
              {m.icon === "hourglass" ? <IHourglass size={24} /> : <ILock size={24} />}
            </div>
            <h1 className="font-serif text-[52px] leading-[1] tracking-tight sm:text-[64px]">{m.title}</h1>
            <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-muted">
              {m.text}
              {status === "expired" && expiresAt ? ` It faded on ${formatDateTime(expiresAt)}.` : ""}
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {(status === "error" || status === "disabled") && (
                <button
                  onClick={() => setAttempt((a) => a + 1)}
                  className="inline-flex h-11 items-center rounded-full border border-line px-6 text-[14px] font-medium text-ink transition-colors hover:bg-ink/5"
                >
                  Try again
                </button>
              )}
              <button
                onClick={onExit}
                className="group inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-transform hover:scale-[1.03] active:scale-95"
              >
                Start your own blank
                <IArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const words = wordCount(view.title) + wordCount(view.body);
  const urgent = left !== null && left < 3600e3;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      {header}
      <article className="mx-auto max-w-[700px] px-6 pt-[8vh] pb-40 sm:px-10">
        <div className="mb-8 flex flex-wrap items-center gap-2 animate-rise">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elev px-3 py-1 text-[11.5px] text-muted">
            <ILock size={12} /> Shared note · read only
          </span>
          {left !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11.5px] tabular-nums",
                urgent ? "border-accent/30 bg-accent/10 text-accent" : "border-line bg-elev text-muted"
              )}
            >
              <IHourglass size={12} className={urgent ? "animate-pulse" : ""} /> fades in {countdown(left)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elev px-3 py-1 text-[11.5px] text-muted">
              ∞ never expires
            </span>
          )}
        </div>

        <p className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint animate-rise" style={{ animationDelay: "40ms" }}>
          Shared {formatDateTime(Date.parse(note.createdAt))} · {words} words
        </p>
        <h1 className="font-serif text-[44px] leading-[1.05] tracking-[-0.015em] break-words animate-rise sm:text-[56px]" style={{ animationDelay: "80ms" }}>
          {view.title || <span className="text-faint">Untitled</span>}
        </h1>
        <div
          className="mt-6 text-[17px] leading-[1.8] break-words whitespace-pre-wrap text-ink/90 animate-rise sm:text-[17.5px]"
          style={{ animationDelay: "140ms" }}
        >
          {view.body}
        </div>
      </article>

      {/* floating action dock */}
      <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 animate-toast" style={{ animationDelay: "300ms" }}>
        <div className="flex items-center gap-1 rounded-full border border-line bg-elev/85 p-1.5 shadow-soft backdrop-blur-xl">
          <button
            onClick={copy}
            className="flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium whitespace-nowrap text-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {copied ? <ICheck size={14} className="text-emerald-500 animate-pop" /> : <ICopy size={14} />}
            {copied ? "Copied" : "Copy text"}
          </button>
          <button
            onClick={() => onSave(view)}
            className="group flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium whitespace-nowrap text-accent-ink transition-transform hover:scale-[1.03] active:scale-95"
          >
            <IDownload size={14} className="transition-transform group-hover:translate-y-0.5" />
            Save to my notes
          </button>
        </div>
      </div>
    </div>
  );
}
