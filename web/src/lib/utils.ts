export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  /** Separator between title and body in the stored legacy `content` ("", "\n" or "\n\n"). */
  sep?: string;
};

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? "⌘" : "Ctrl";
/** Modifier prefix for app shortcuts. Plain ⌥ is avoided: on macOS it types accents (⌥N → "˜"). */
export const HOT = isMac ? "⌃⌥" : "Ctrl Alt";

export function displayTitle(n: Pick<Note, "title" | "body">) {
  if (n.title.trim()) return n.title.trim();
  const first = n.body.trim().split("\n")[0]?.replace(/^[-*•\d.)\s[\]x]+/i, "").trim();
  return first ? first.slice(0, 60) : "Untitled";
}

export function snippet(n: Note) {
  const lines = n.body.trim().split("\n").filter(Boolean);
  const src = n.title.trim() ? lines : lines.slice(1);
  return src.join(" ").slice(0, 90);
}

export function wordCount(s: string) {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function relTime(ts: number, now = Date.now()) {
  const d = (now - ts) / 1000;
  if (d < 10) return "just now";
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function countdown(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

export function groupOf(n: Note, now = Date.now()) {
  if (n.pinned) return "Pinned";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const t = start.getTime();
  if (n.updatedAt >= t) return "Today";
  if (n.updatedAt >= t - 86400000) return "Yesterday";
  if (n.updatedAt >= t - 86400000 * 6) return "This week";
  return "Earlier";
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function download(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "note"
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
