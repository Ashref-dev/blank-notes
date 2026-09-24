import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Note } from "../lib/utils";
import { LAST_NOTE_KEY, NOTES_KEY, newId, readNotes, safeGet, safeSet, writeNotes } from "../lib/storage";

let initialCache: Note[] | null = null;
function load(): Note[] {
  if (!initialCache) {
    initialCache = readNotes() ?? [];
  }
  return initialCache;
}

const byRecent = (a: Note, b: Note) => {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return b.updatedAt - a.updatedAt;
};

function initialActive(): string | null {
  const list = load();
  const has = (id: string | null) => !!id && list.some((n) => n.id === id);
  const fromUrl = new URLSearchParams(location.search).get("note");
  if (has(fromUrl)) return fromUrl;
  const last = safeGet(LAST_NOTE_KEY);
  if (has(last)) return last;
  return [...list].sort(byRecent)[0]?.id ?? null;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(load);
  const [activeId, setActiveIdState] = useState<string | null>(initialActive);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timer = useRef<number | undefined>(undefined);
  const skipWrite = useRef(false);
  const failed = useRef(false);

  // persist immediately (no data loss), show a soft saving state
  useEffect(() => {
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    const ok = writeNotes(notes);
    failed.current = !ok;
    if (!ok) {
      window.clearTimeout(timer.current);
      setSaveState("error");
    }
  }, [notes]);

  useEffect(() => {
    safeSet(LAST_NOTE_KEY, activeId);
  }, [activeId]);

  // sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== NOTES_KEY && e.key !== null) return;
      skipWrite.current = true;
      const next = readNotes() ?? [];
      setNotes(next);
      setActiveIdState((cur) => (cur && next.some((n) => n.id === cur) ? cur : ([...next].sort(byRecent)[0]?.id ?? null)));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const pulseSave = useCallback(() => {
    window.clearTimeout(timer.current);
    setSaveState("saving");
    // an error stays visible until a write succeeds again
    timer.current = window.setTimeout(() => setSaveState(failed.current ? "error" : "saved"), 650);
  }, []);

  const setActiveId = useCallback((id: string | null) => setActiveIdState(id), []);

  const create = useCallback(
    (init?: Partial<Note>) => {
      const now = Date.now();
      const n: Note = { id: newId(), title: "", body: "", createdAt: now, updatedAt: now, ...init };
      setNotes((prev) => [n, ...prev]);
      setActiveIdState(n.id);
      pulseSave();
      return n;
    },
    [pulseSave]
  );

  const update = useCallback(
    (id: string, patch: Partial<Note>) => {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
      pulseSave();
    },
    [pulseSave]
  );

  const remove = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        setActiveIdState((cur) => (cur === id ? ([...next].sort(byRecent)[0]?.id ?? null) : cur));
        return next;
      });
      pulseSave();
    },
    [pulseSave]
  );

  /** Re-insert notes as-is (undo delete, import). Ids that already exist are skipped. */
  const restore = useCallback(
    (list: Note[], activate = true) => {
      if (!list.length) return;
      setNotes((prev) => {
        const have = new Set(prev.map((p) => p.id));
        return [...list.filter((n) => !have.has(n.id)), ...prev];
      });
      if (activate) setActiveIdState(list[0].id);
      pulseSave();
    },
    [pulseSave]
  );

  const togglePin = useCallback(
    (id: string) => {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
      pulseSave();
    },
    [pulseSave]
  );

  const sorted = useMemo(() => [...notes].sort(byRecent), [notes]);
  const active = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId]);

  return { notes: sorted, active, activeId, setActiveId, create, update, remove, restore, togglePin, saveState };
}
