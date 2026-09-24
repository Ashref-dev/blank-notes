import type { Note } from "./utils";

// These keys and the stored shape are shared with the previous version of blank.
// Existing browsers keep working without any migration step.
export const NOTES_KEY = "blankpage_notes";
export const LAST_NOTE_KEY = "blankpage_last_note";
export const THEME_KEY = "theme";
const CORRUPT_BACKUP_KEY = "blankpage_notes_unreadable_backup";

/** Legacy on-disk note. `content` is the source of truth; its first line is the title. */
type StoredNote = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
};

/**
 * Split legacy content into the editor's title + body. Lossless:
 * joinContent(splitContent(c)) === c for every string c.
 */
export function splitContent(content: string): Pick<Note, "title" | "body" | "sep"> {
  const i = content.indexOf("\n");
  if (i === -1) return { title: content, sep: "", body: "" };
  const sep = content[i + 1] === "\n" ? "\n\n" : "\n";
  return { title: content.slice(0, i), sep, body: content.slice(i + sep.length) };
}

export function joinContent(n: Pick<Note, "title" | "body" | "sep">): string {
  const sep = n.sep || (n.body ? "\n\n" : "");
  return n.title + sep + n.body;
}

/** Same rule the previous app used for its `title` field. */
function legacyTitle(content: string) {
  const first = content.split("\n")[0].trim();
  if (!first) return "Untitled";
  return first.length > 50 ? first.slice(0, 50) + "..." : first;
}

function toTime(v: unknown, fallback: number) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Accepts the legacy map, an array, or a backup file ({ notes: [...] }). Items may carry `content` or `title` + `body`. */
export function normalizeNotes(data: unknown): Note[] {
  let entries: [string | null, unknown][] = [];
  if (Array.isArray(data)) entries = data.map((v) => [null, v]);
  else if (isRecord(data) && Array.isArray(data.notes)) entries = data.notes.map((v: unknown) => [null, v]);
  else if (isRecord(data)) entries = Object.entries(data);

  const now = Date.now();
  const seen = new Set<string>();
  const out: Note[] = [];
  for (const [key, raw] of entries) {
    if (!isRecord(raw)) continue;
    let parts: Pick<Note, "title" | "body" | "sep">;
    if (typeof raw.content === "string") parts = splitContent(raw.content);
    else if (typeof raw.body === "string") parts = { title: String(raw.title ?? "").replace(/\n/g, " "), body: raw.body, sep: "" };
    else continue;
    let id = typeof raw.id === "string" && raw.id ? raw.id : key || newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const createdAt = toTime(raw.createdAt, now);
    out.push({ id, ...parts, createdAt, updatedAt: toTime(raw.updatedAt, createdAt), pinned: raw.pinned === true });
  }
  return out;
}

export function newId() {
  return "note_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
}

/** null = nothing stored yet (first visit). */
export function readNotes(): Note[] | null {
  const raw = localStorage.getItem(NOTES_KEY);
  if (raw === null) return null;
  try {
    return normalizeNotes(JSON.parse(raw));
  } catch {
    // Never overwrite something we can't read: keep a copy before the app writes again.
    if (localStorage.getItem(CORRUPT_BACKUP_KEY) === null) localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
    return [];
  }
}

export function serializeNotes(notes: Note[]): string {
  const map: Record<string, StoredNote> = {};
  for (const n of notes) {
    const content = joinContent(n);
    map[n.id] = {
      id: n.id,
      title: legacyTitle(content),
      content,
      createdAt: new Date(n.createdAt).toISOString(),
      updatedAt: new Date(n.updatedAt).toISOString(),
      ...(n.pinned ? { pinned: true } : {}),
    };
  }
  return JSON.stringify(map);
}

/** Returns false when the browser refused the write (quota exceeded, private mode…). */
export function writeNotes(notes: Note[]): boolean {
  try {
    localStorage.setItem(NOTES_KEY, serializeNotes(notes));
    return true;
  } catch {
    return false;
  }
}

export function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}
