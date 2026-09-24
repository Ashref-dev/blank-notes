// Client for the Go API in api/app.go.
import { splitContent } from "./storage";

export type SharedNote = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  expiresAt: string | null;
};

export type SharedResult =
  | { status: "ok"; note: SharedNote }
  | { status: "expired" }
  | { status: "notfound" }
  | { status: "disabled" }
  | { status: "error" };

type Preloaded = { id: string; status: SharedResult["status"]; note?: SharedNote };

/** The Go server inlines the shared note into /shared/:id so it renders without a second round trip. */
function readPreloaded(id: string): SharedResult | null {
  const el = document.getElementById("shared-data");
  if (!el?.textContent) return null;
  try {
    const data = JSON.parse(el.textContent) as Preloaded;
    el.remove(); // one-shot: later navigations fetch fresh data
    if (data.id !== id) return null;
    if (data.status === "ok") return data.note ? { status: "ok", note: data.note } : null;
    return { status: data.status } as SharedResult;
  } catch {
    return null;
  }
}

export async function fetchShared(id: string): Promise<SharedResult> {
  const pre = readPreloaded(id);
  if (pre) return pre;
  try {
    const res = await fetch(`/api/shared/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) });
    if (res.status === 404 || res.status === 400) return { status: "notfound" };
    if (res.status === 410) return { status: "expired" };
    if (res.status === 503) return { status: "disabled" };
    if (!res.ok) return { status: "error" };
    return { status: "ok", note: (await res.json()) as SharedNote };
  } catch {
    return { status: "error" };
  }
}

export type ShareExpiry = { expiryHours: number } | { expiresAt: string };

export type CreateShareResult =
  | { ok: true; url: string; expiresAt: number | null }
  | { ok: false; reason: "disabled" | "invalid" | "network" | "server" };

export async function createShare(title: string, content: string, expiry: ShareExpiry): Promise<CreateShareResult> {
  try {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, ...expiry }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 503) return { ok: false, reason: "disabled" };
    if (res.status === 400 || res.status === 413) return { ok: false, reason: "invalid" };
    if (!res.ok) return { ok: false, reason: "server" };
    const data = (await res.json()) as { shareId: string; expiresAt?: string | null };
    return {
      ok: true,
      url: `${location.origin}/shared/${data.shareId}`,
      expiresAt: data.expiresAt ? Date.parse(data.expiresAt) : null,
    };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * Notes shared by the previous version stored the whole text in `content` (title as first line,
 * possibly truncated in `title`). Show those the same way as new shares: title + body without repetition.
 */
export function presentShared(n: SharedNote): { title: string; body: string } {
  const title = n.title.trim();
  const { title: first, body } = splitContent(n.content);
  const firstLine = first.trim();
  if (title && (firstLine === title || (title.endsWith("...") && firstLine.startsWith(title.slice(0, -3))))) {
    return { title: firstLine, body };
  }
  return { title, body: n.content };
}
