import { useEffect, useState } from "react";
import { cn } from "../utils/cn";
import { type ShareExpiry, createShare } from "../lib/api";
import { type Note, copyText, displayTitle, formatDateTime } from "../lib/utils";
import { toast } from "../lib/toast";
import { ICheck, IClock, ICopy, IHourglass, ILink, ILock, IShare, IX } from "./Icons";

const PRESETS = [
  { id: "never", label: "Never", hours: 0 },
  { id: "1h", label: "1 hour", hours: 1 },
  { id: "1d", label: "1 day", hours: 24 },
  { id: "7d", label: "1 week", hours: 168 },
  { id: "30d", label: "1 month", hours: 720 },
  { id: "custom", label: "Custom", hours: 0 },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

type Created = { url: string; expiresAt: number | null; preset: PresetId; custom: string; snapshot: string };

// Links created during this session, so reopening the dialog doesn't mint a new link for an unchanged note.
const created = new Map<string, Created>();

const ERRORS = {
  disabled: "Sharing is turned off on this server right now.",
  invalid: "That note couldn't be shared. It may be too large.",
  network: "Couldn't reach the server. Check your connection and try again.",
  server: "Something went wrong on our side. Please try again.",
};

function toLocalInput(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ShareModal({ note, onClose }: { note: Note; onClose: () => void }) {
  const snapshot = note.title.trim() + "\u0000" + note.body;
  const cached = created.get(note.id);
  const reuse = cached && cached.snapshot === snapshot ? cached : null;

  const [preset, setPreset] = useState<PresetId>(reuse?.preset ?? "7d");
  const [custom, setCustom] = useState(() => reuse?.custom ?? toLocalInput(Date.now() + 3 * 86400e3));
  const [result, setResult] = useState<Created | null>(reuse);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof ERRORS | null>(null);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);

  const customTs = new Date(custom).getTime();
  const invalid = preset === "custom" && (Number.isNaN(customTs) || customTs <= Date.now() + 60e3);
  const empty = !note.title.trim() && !note.body.trim();
  const presetHours = PRESETS.find((p) => p.id === preset)?.hours ?? 0;
  const previewExpiry = preset === "custom" ? (invalid ? null : customTs) : presetHours ? Date.now() + presetHours * 3600e3 : null;

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [close]);

  const choose = (id: PresetId) => {
    setPreset(id);
    setResult(null);
    setError(null);
    setCopied(false);
  };

  const copy = async (url: string, expiresAt: number | null) => {
    if (!(await copyText(url))) {
      toast({ message: "Couldn't copy. Select the link and copy it manually.", icon: "info" });
      return;
    }
    setCopied(true);
    toast({ message: expiresAt ? `Link copied · expires ${formatDateTime(expiresAt)}` : "Link copied to clipboard", icon: "link" });
    setTimeout(() => setCopied(false), 2200);
  };

  const generate = async () => {
    if (busy || invalid || empty) return;
    setBusy(true);
    setError(null);
    const expiry: ShareExpiry = preset === "custom" ? { expiresAt: new Date(customTs).toISOString() } : { expiryHours: presetHours };
    const res = await createShare(note.title.trim(), note.body, expiry);
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    const c: Created = { url: res.url, expiresAt: res.expiresAt, preset, custom, snapshot };
    created.set(note.id, c);
    setResult(c);
    await copy(c.url, c.expiresAt);
  };

  const nativeShare = async () => {
    if (!result) return;
    try {
      await navigator.share({ title: displayTitle(note), url: result.url });
    } catch {
      /* cancelled */
    }
  };

  const shownExpiry = result ? result.expiresAt : previewExpiry;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div
        onClick={close}
        className={cn("absolute inset-0 bg-black/25 backdrop-blur-sm transition-opacity duration-200", closing ? "opacity-0" : "animate-fade")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className={cn(
          "relative w-full max-w-[460px] overflow-hidden rounded-[22px] border border-line bg-elev shadow-soft transition-all duration-200",
          closing ? "translate-y-2 scale-[0.98] opacity-0" : "animate-scale-in"
        )}
      >
        {/* header */}
        <div className="relative px-6 pt-6 pb-5">
          <div className="pointer-events-none absolute -top-24 -right-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent/10 text-accent">
                <IShare size={18} />
              </div>
              <div>
                <h2 id="share-title" className="font-serif text-[26px] leading-none">
                  Share note
                </h2>
                <p className="mt-1 max-w-[260px] truncate text-[12.5px] text-muted">“{displayTitle(note)}”</p>
              </div>
            </div>
            <button onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink">
              <IX size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 pb-6">
          {/* expiry */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink/80">
                <IHourglass size={14} className="text-muted" /> Link expires
              </span>
              <span key={String(shownExpiry)} className="text-[11.5px] text-muted animate-fade">
                {shownExpiry ? formatDateTime(shownExpiry) : invalid ? "—" : "Lives forever"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-ink/[0.04] p-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => choose(p.id)}
                  disabled={busy}
                  aria-pressed={preset === p.id}
                  className={cn(
                    "relative h-9 rounded-xl text-[12.5px] font-medium transition-all duration-200 active:scale-95 disabled:cursor-wait",
                    preset === p.id ? "bg-elev text-ink shadow-soft" : "text-muted hover:text-ink"
                  )}
                >
                  {p.label}
                  {preset === p.id && <span className="absolute top-1.5 right-1.5 h-1 w-1 rounded-full bg-accent animate-pop" />}
                </button>
              ))}
            </div>
            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                preset === "custom" ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <label
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-xl border px-3 transition-colors",
                    invalid ? "border-red-500/40 bg-red-500/5" : "border-line bg-bg/50"
                  )}
                >
                  <IClock size={15} className="text-muted" />
                  <input
                    type="datetime-local"
                    value={custom}
                    min={toLocalInput(Date.now())}
                    onChange={(e) => {
                      setCustom(e.target.value);
                      setResult(null);
                      setError(null);
                    }}
                    tabIndex={preset === "custom" ? 0 : -1}
                    className="w-full bg-transparent text-[13px] text-ink outline-none"
                  />
                </label>
                {invalid && <p className="mt-1.5 px-1 text-[11.5px] text-red-500">Pick a moment in the future.</p>}
              </div>
            </div>
          </div>

          {/* link */}
          <div>
            {result ? (
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-bg/60 p-1.5 pl-3.5 animate-fade">
                <ILink size={15} className="shrink-0 text-accent" />
                <input
                  readOnly
                  value={result.url.replace(/^https?:\/\//, "")}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Share link"
                  className="min-w-0 flex-1 truncate bg-transparent font-mono text-[12px] text-muted outline-none"
                />
                <button
                  onClick={() => copy(result.url, result.expiresAt)}
                  className={cn(
                    "relative flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-xl px-4 text-[13px] font-medium transition-all duration-300 active:scale-95",
                    copied ? "bg-emerald-500 text-white" : "bg-ink text-bg hover:opacity-90"
                  )}
                >
                  <span className={cn("flex items-center gap-1.5 transition-all duration-300", copied ? "-translate-y-8 opacity-0" : "")}>
                    <ICopy size={14} /> Copy
                  </span>
                  <span
                    className={cn(
                      "absolute inset-0 flex items-center justify-center gap-1.5 transition-all duration-300",
                      copied ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                    )}
                  >
                    <ICheck size={15} /> Copied
                  </span>
                </button>
              </div>
            ) : (
              <button
                onClick={generate}
                disabled={busy || invalid || empty}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[14px] font-medium text-accent-ink transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-ink/40 border-t-accent-ink" /> Creating link…
                  </>
                ) : (
                  <>
                    <ILink size={15} /> {error ? "Try again" : "Create link"}
                  </>
                )}
              </button>
            )}
            <div className="mt-2 flex min-h-4 items-center justify-between gap-3 px-1 text-[11px]">
              {error ? (
                <span role="alert" className="text-red-500">
                  {ERRORS[error]}
                </span>
              ) : (
                <span className="text-faint">
                  {empty
                    ? "This note is empty. Write something first."
                    : result
                      ? "Anyone with this link can read the note."
                      : "Creates a read-only snapshot of this note."}
                </span>
              )}
              {result && "share" in navigator && (
                <button onClick={nativeShare} className="shrink-0 font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
                  More options…
                </button>
              )}
            </div>
          </div>

          {/* privacy note */}
          <div className="flex gap-3 rounded-2xl border border-dashed border-line p-3.5">
            <ILock size={15} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[12px] leading-relaxed text-muted">
              <span className="font-medium text-ink/80">Only this note leaves your browser.</span> A copy of its text is stored on
              blank.achraf.tn so the link works anywhere. Later edits won't change it, images aren't included, and expired links are
              deleted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
