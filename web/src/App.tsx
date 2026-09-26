import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "./utils/cn";
import { useNotes, type SaveState } from "./hooks/useNotes";
import { useAttachments } from "./hooks/useAttachments";
import { useMediaQuery, useTheme } from "./hooks/misc";
import { deleteAttachmentsForNote, imageFiles } from "./lib/attachments";
import { joinContent, newId, normalizeNotes } from "./lib/storage";
import { toast } from "./lib/toast";
import { HOT, type Note, copyText, displayTitle, download, relTime, slug } from "./lib/utils";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import EmptyState from "./components/EmptyState";
import ShareModal from "./components/ShareModal";
import CommandPalette, { type Command } from "./components/CommandPalette";
import SharedView from "./components/SharedView";
import Toaster from "./components/Toaster";
import { AttachmentStrip, DropOverlay } from "./components/Attachments";
import {
  ICheck,
  ICopy,
  IDoc,
  IDownload,
  IFocus,
  IMoon,
  IPin,
  IPlus,
  IShare,
  ISidebar,
  ISparkle,
  ISun,
  ITrash,
  IX,
} from "./components/Icons";

type Route = { kind: "app" } | { kind: "shared"; id: string };

function readRoute(): Route {
  const m = location.pathname.match(/^\/shared\/([^/]+)\/?$/);
  if (m) return { kind: "shared", id: decodeURIComponent(m[1]) };
  // fallback used by the server when it can't render /shared/:id directly
  const q = new URLSearchParams(location.search).get("shared");
  if (q) {
    history.replaceState(null, "", `/shared/${encodeURIComponent(q)}`);
    return { kind: "shared", id: q };
  }
  return { kind: "app" };
}

const SIDEBAR_KEY = "blank.sidebar.v1";
// note id → timer that deletes its images once "Undo" is no longer possible
const pendingDeletes = new Map<string, number>();
const UNDO_MS = 5000;

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "error") {
    return (
      <div className="flex h-8 items-center gap-2 rounded-full px-3 text-[12px] text-red-500" title="This browser refused to save. Free some space or back up your notes.">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="hidden sm:inline">Not saved · storage full</span>
      </div>
    );
  }
  return (
    <div className="flex h-8 items-center gap-2 rounded-full px-3 text-[12px] text-muted" title="Saved to this browser's local storage">
      <span className="relative grid h-3.5 w-3.5 place-items-center">
        {state === "saving" ? (
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-faint border-t-accent" />
        ) : state === "saved" ? (
          <>
            <span className="absolute h-2 w-2 rounded-full bg-emerald-500 animate-ping-soft" />
            <ICheck size={13} className="text-emerald-500 animate-pop" />
          </>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
      </span>
      <span className="hidden sm:inline">{state === "saving" ? "Saving…" : state === "saved" ? "Saved locally" : "Local"}</span>
    </div>
  );
}

const isBlank = (n: Note | null | undefined) => !!n && !n.title.trim() && !n.body.trim();

/** "# Heading" on the first line becomes the title (round-trips our own Markdown export). */
function noteFromText(filename: string, text: string): Partial<Note> {
  const t = text.replace(/\r\n/g, "\n");
  const m = t.match(/^# (.+)\n?\n?/);
  if (m) return { title: m[1].trim(), body: t.slice(m[0].length), sep: "\n\n" };
  return { title: filename.replace(/\.(md|markdown|txt)$/i, ""), body: t, sep: "\n\n" };
}

/** Reads backups (.json, current or legacy format) and text files into notes ready to insert. */
async function parseImport(files: File[], existing: Note[]) {
  const byId = new Map(existing.map((n) => [n.id, n]));
  const incoming: Note[] = [];
  let failed = 0;
  let skipped = 0;
  for (const f of files) {
    let text: string;
    try {
      text = await f.text();
    } catch {
      failed++;
      continue;
    }
    if (!/\.json$/i.test(f.name) && f.type !== "application/json") {
      const now = Date.now();
      incoming.push({ id: newId(), title: "", body: "", createdAt: now, updatedAt: now, ...noteFromText(f.name, text) });
      continue;
    }
    let list: Note[] = [];
    try {
      list = normalizeNotes(JSON.parse(text));
    } catch {
      /* not JSON */
    }
    if (!list.length) {
      failed++;
      continue;
    }
    for (const n of list) {
      const have = byId.get(n.id);
      if (have && joinContent(have) === joinContent(n)) {
        skipped++;
        continue;
      }
      incoming.push(have || incoming.some((x) => x.id === n.id) ? { ...n, id: newId() } : n);
    }
  }
  return { incoming, failed, skipped };
}

export default function App() {
  const store = useNotes();
  const { notes, active, create, update, remove, restore, togglePin, setActiveId, saveState } = store;
  const { theme, toggle: toggleTheme } = useTheme();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const media = useAttachments(active?.id ?? null);

  const [route, setRoute] = useState<Route>(readRoute);
  const [sidebar, setSidebar] = useState(() => !matchMedia("(max-width: 767px)").matches && localStorage.getItem(SIDEBAR_KEY) === "1");
  const [palette, setPalette] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [typing, setTyping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<{ id: string; target: "title" | "body" } | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const dragDepth = useRef(0);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  // stored as state (callback refs) so the command list can use them without reading refs during render
  const [importInput, setImportInput] = useState<HTMLInputElement | null>(null);
  const [imageInput, setImageInput] = useState<HTMLInputElement | null>(null);

  const activeIsEmpty = isBlank(active) && media.items.length === 0 && media.status !== "loading";

  /* ---------- routing ---------- */
  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goHome = useCallback(() => {
    history.pushState(null, "", "/");
    setRoute({ kind: "app" });
  }, []);

  // keep ?note=<id> in the address bar, like the previous version (bookmarks keep working)
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (route.kind !== "app") return;
    const url = new URL(location.href);
    if (activeId) url.searchParams.set("note", activeId);
    else url.searchParams.delete("note");
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  }, [activeId, route.kind]);

  /* ---------- persistence of UI prefs ---------- */
  useEffect(() => {
    if (!isMobile) localStorage.setItem(SIDEBAR_KEY, sidebar ? "1" : "0");
  }, [sidebar, isMobile]);

  useEffect(() => {
    if (isMobile) setSidebar(false);
  }, [isMobile]);

  useEffect(() => {
    if (route.kind !== "app") return;
    document.title = active ? `${displayTitle(active)} — blank.` : "blank.achraf.tn — a quiet place for your thoughts";
  }, [active, route.kind]);

  /* ---------- deferred attachment cleanup (so "Undo" can bring images back) ---------- */
  const flushDelete = useCallback((id: string) => {
    const t = pendingDeletes.get(id);
    if (t === undefined) return;
    window.clearTimeout(t);
    pendingDeletes.delete(id);
    deleteAttachmentsForNote(id).catch(() => {});
  }, []);

  useEffect(() => {
    const flushAll = () => [...pendingDeletes.keys()].forEach(flushDelete);
    window.addEventListener("pagehide", flushAll);
    return () => window.removeEventListener("pagehide", flushAll);
  }, [flushDelete]);

  /* ---------- actions ---------- */
  const newNote = useCallback(
    (body = "") => {
      // reuse an untouched blank note instead of piling up empties
      if (active && activeIsEmpty) {
        if (body) update(active.id, { body });
        requestAnimationFrame(() => {
          const el = document.getElementById(body ? "note-body" : "note-title") as HTMLTextAreaElement | null;
          el?.focus();
          if (el && body) el.setSelectionRange(el.value.length, el.value.length);
        });
        return;
      }
      const n = create({ body });
      setPendingFocus({ id: n.id, target: body ? "body" : "title" });
      setFocusMode(false);
      if (isMobile) setSidebar(false);
      scroller?.scrollTo({ top: 0 });
    },
    [active, activeIsEmpty, create, update, isMobile, scroller]
  );

  const deleteNote = useCallback(
    (id: string) => {
      const n = notes.find((x) => x.id === id);
      if (!n) return;
      remove(id);
      pendingDeletes.set(
        id,
        window.setTimeout(() => flushDelete(id), UNDO_MS + 1000)
      );
      // nothing worth undoing: a blank note (the active one is only blank if it also has no images)
      if (isBlank(n) && (id !== active?.id || activeIsEmpty)) return;
      toast({
        message: `Deleted “${displayTitle(n)}”`,
        icon: "trash",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          run: () => {
            window.clearTimeout(pendingDeletes.get(id));
            pendingDeletes.delete(id);
            restore([n]);
          },
        },
      });
    },
    [notes, remove, restore, flushDelete, active?.id, activeIsEmpty]
  );

  const selectNote = useCallback(
    (id: string) => {
      if (active && active.id !== id && activeIsEmpty) remove(active.id);
      setActiveId(id);
      setPendingFocus(null);
      if (isMobile) setSidebar(false);
      scroller?.scrollTo({ top: 0 });
    },
    [active, activeIsEmpty, remove, setActiveId, isMobile, scroller]
  );

  const pinNote = useCallback(
    (id: string) => {
      const n = notes.find((x) => x.id === id);
      togglePin(id);
      if (n) toast({ message: n.pinned ? "Unpinned" : "Pinned to top", icon: "pin", duration: 1800 });
    },
    [notes, togglePin]
  );

  const openShare = useCallback(() => {
    if (!active) return toast({ message: "Open a note to share it", icon: "info" });
    if (isBlank(active)) return toast({ message: "Write something before sharing", icon: "info" });
    setSharing(true);
  }, [active]);

  const copyNote = useCallback(async () => {
    if (!active) return;
    const text = joinContent(active);
    if (!text.trim()) return toast({ message: "This note is empty", icon: "info" });
    const ok = await copyText(text);
    toast(ok ? { message: "Note copied to clipboard", icon: "check" } : { message: "Couldn't copy the note", icon: "info" });
  }, [active]);

  const exportNote = useCallback(
    (format: "md" | "txt") => {
      if (!active) return;
      if (isBlank(active)) return toast({ message: "This note is empty", icon: "info" });
      const name = slug(displayTitle(active));
      if (format === "md") download(`${name}.md`, (active.title.trim() ? `# ${active.title.trim()}\n\n` : "") + active.body, "text/markdown");
      else download(`${name}.txt`, joinContent(active), "text/plain");
      toast({ message: format === "md" ? "Exported as Markdown" : "Exported as plain text", icon: "download" });
    },
    [active]
  );

  const exportAll = useCallback(() => {
    if (!notes.length) return toast({ message: "No notes to back up yet", icon: "info" });
    const payload = {
      app: "blank.achraf.tn",
      version: 2,
      exportedAt: new Date().toISOString(),
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        content: joinContent(n),
        createdAt: new Date(n.createdAt).toISOString(),
        updatedAt: new Date(n.updatedAt).toISOString(),
        pinned: !!n.pinned,
      })),
    };
    download(`blank-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
    toast({ message: `Backed up ${notes.length} ${notes.length === 1 ? "note" : "notes"}`, icon: "download" });
  }, [notes]);

  const onImport = async (files: File[]) => {
    if (!files.length) return;
    const { incoming, failed, skipped } = await parseImport(files, notes);
    if (incoming.length) {
      restore(incoming);
      setFocusMode(false);
      scroller?.scrollTo({ top: 0 });
    }
    const parts = [];
    if (incoming.length) parts.push(`Imported ${incoming.length} ${incoming.length === 1 ? "note" : "notes"}`);
    if (skipped) parts.push(`${skipped} already here`);
    if (failed) parts.push(`${failed} ${failed === 1 ? "file" : "files"} unreadable`);
    toast({
      message: parts.join(" · ") || "Nothing to import",
      icon: incoming.length ? "check" : "info",
    });
  };

  const attachImages = useCallback(
    (files: File[]) => {
      const imgs = imageFiles(files);
      if (!imgs.length) return;
      if (!active) {
        toast({ message: "Open a note first, then add images", icon: "info" });
        return;
      }
      media.add(imgs);
    },
    [active, media]
  );

  const onTyping = useCallback(() => {
    setTyping(true);
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTyping(false), 1400);
  }, []);

  /* ---------- paste images anywhere in the app ---------- */
  useEffect(() => {
    if (route.kind !== "app") return;
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFiles(Array.from(e.clipboardData?.items ?? []).flatMap((i) => (i.kind === "file" ? [i.getAsFile()!] : [])));
      if (!files.length) return;
      e.preventDefault();
      attachImages(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [route.kind, attachImages]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    if (route.kind !== "app") return;
    const onKey = (e: KeyboardEvent) => {
      const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
      const target = e.target as HTMLElement;
      const inField = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (palette || sharing) return;

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (saveState === "error") toast({ message: "This browser's storage is full. Back up your notes (⌘K → Back up).", icon: "info", duration: 5000 });
        else toast({ message: "Already saved. It saves itself.", icon: "check", duration: 1800 });
        return;
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        setSidebar((s) => !s);
        return;
      }
      if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey && !e.getModifierState("AltGraph")) {
        const run: Record<string, () => void> = {
          KeyN: () => newNote(),
          KeyB: () => setSidebar((s) => !s),
          KeyF: () => setFocusMode((f) => !f),
          KeyS: openShare,
          KeyT: () => toggleTheme(),
        };
        if (run[e.code]) {
          e.preventDefault();
          run[e.code]();
          return;
        }
      }
      if (e.key === "Escape" && !e.isComposing && target.tagName !== "INPUT" && (active || focusMode)) {
        e.preventDefault();
        setFocusMode((f) => !f);
        return;
      }
      if (!inField && e.key === "/") {
        e.preventDefault();
        setFocusMode(false);
        setSidebar(true);
        setTimeout(() => document.getElementById("note-search")?.focus(), 60);
        return;
      }
      // empty state: any printable key starts a note
      if (!active && !inField && !mod && !e.altKey && e.key.length === 1) {
        e.preventDefault();
        newNote(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route.kind, palette, sharing, focusMode, active, newNote, openShare, toggleTheme, saveState]);

  /* ---------- commands ---------- */
  const commands = useMemo<Command[]>(() => {
    const a: Command[] = [
      { id: "new", group: "Actions", label: "New note", icon: <IPlus size={14} />, shortcut: `${HOT} N`, keywords: "create add page", run: () => newNote() },
    ];
    if (active) {
      a.push(
        { id: "share", group: "Actions", label: "Share this note", hint: "Link with optional expiry", icon: <IShare size={14} />, shortcut: `${HOT} S`, keywords: "link send expire public", run: openShare },
        { id: "copy", group: "Actions", label: "Copy note text", icon: <ICopy size={14} />, keywords: "clipboard content", run: copyNote },
        { id: "pin", group: "Actions", label: active.pinned ? "Unpin note" : "Pin note", icon: <IPin size={14} />, run: () => pinNote(active.id) },
        {
          id: "img",
          group: "Actions",
          label: "Attach image",
          hint: "Or paste / drop one anywhere",
          icon: <ISparkle size={14} />,
          keywords: "picture photo upload attachment file",
          run: () => (media.status === "unavailable" ? toast({ message: "Images can't be stored in this browser", icon: "info" }) : imageInput?.click()),
        },
        {
          id: "dup",
          group: "Actions",
          label: "Duplicate note",
          icon: <ICopy size={14} />,
          keywords: "copy clone",
          run: () => {
            create({ title: active.title ? `${active.title} (copy)` : "", body: active.body, sep: active.sep });
            toast({ message: "Duplicated", icon: "check" });
          },
        },
        { id: "md", group: "Actions", label: "Export as Markdown", icon: <IDownload size={14} />, keywords: "download save file md", run: () => exportNote("md") },
        { id: "txt", group: "Actions", label: "Export as plain text", icon: <IDownload size={14} />, keywords: "download save file txt", run: () => exportNote("txt") },
        { id: "print", group: "Actions", label: "Print note", icon: <IDoc size={14} />, keywords: "pdf paper", run: () => window.print() }
      );
    }
    a.push(
      { id: "focus", group: "Actions", label: focusMode ? "Exit focus mode" : "Enter focus mode", icon: <IFocus size={14} />, shortcut: "Esc", keywords: "zen distraction", run: () => setFocusMode((f) => !f) },
      { id: "theme", group: "Actions", label: theme === "dark" ? "Switch to light" : "Switch to dark", icon: theme === "dark" ? <ISun size={14} /> : <IMoon size={14} />, shortcut: `${HOT} T`, keywords: "theme mode night day appearance", run: () => toggleTheme() },
      { id: "sidebar", group: "Actions", label: sidebar ? "Hide sidebar" : "Show sidebar", icon: <ISidebar size={14} />, shortcut: `${HOT} B`, run: () => setSidebar((s) => !s) },
      { id: "backup", group: "Actions", label: "Back up all notes", hint: "Download a .json file", icon: <IDownload size={14} />, keywords: "export backup json", run: exportAll },
      { id: "import", group: "Actions", label: "Import notes", hint: ".json backup, .md or .txt", icon: <IDoc size={14} />, keywords: "restore upload open", run: () => importInput?.click() }
    );
    if (active)
      a.push({ id: "del", group: "Actions", label: "Delete this note", icon: <ITrash size={14} />, keywords: "remove trash", run: () => deleteNote(active.id) });

    const n: Command[] = notes.map((x) => ({
      id: "n-" + x.id,
      group: "Notes",
      label: displayTitle(x),
      hint: `${relTime(x.updatedAt)}${x.body ? " · " + x.body.replace(/\s+/g, " ").slice(0, 70) : ""}`,
      icon: x.pinned ? <IPin size={13} filled /> : <IDoc size={14} />,
      keywords: x.body.slice(0, 2000),
      run: () => selectNote(x.id),
    }));
    return [...a, ...n];
  }, [active, notes, focusMode, theme, sidebar, media, imageInput, importInput, newNote, openShare, copyNote, pinNote, create, exportNote, exportAll, toggleTheme, deleteNote, selectNote]);

  /* ---------- render ---------- */
  if (route.kind === "shared") {
    return (
      <>
        <SharedView
          id={route.id}
          theme={theme}
          onTheme={toggleTheme}
          onExit={goHome}
          onSave={(p) => {
            const n = create({ title: p.title, body: p.body, sep: "\n\n" });
            goHome();
            setPendingFocus({ id: n.id, target: "body" });
            toast({ message: "Saved to your notes", icon: "check" });
          }}
        />
        <Toaster />
      </>
    );
  }

  const chromeHidden = focusMode;

  return (
    <>
      <div
        className="app-shell flex h-dvh overflow-hidden bg-bg text-ink"
        onDragEnter={(e) => {
          if (!active || !Array.from(e.dataTransfer.types).includes("Files")) return;
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!active || !Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (imageFiles(files).length) attachImages(files);
          else if (files.some((f) => /\.(json|md|markdown|txt)$/i.test(f.name))) onImport(files);
          else toast({ message: "Drop images to attach, or .md / .txt / .json to import", icon: "info" });
        }}
      >
        <Sidebar
          open={sidebar && !focusMode}
          isMobile={isMobile}
          notes={notes}
          activeId={active?.id ?? null}
          theme={theme}
          onSelect={selectNote}
          onCreate={() => newNote()}
          onDelete={deleteNote}
          onPin={pinNote}
          onClose={() => setSidebar(false)}
          onPalette={() => setPalette(true)}
          onTheme={toggleTheme}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          {!isMobile && !focusMode && (
            <button
              onClick={() => setSidebar((s) => !s)}
              title={`${sidebar ? "Collapse" : "Expand"} sidebar (${HOT} B)`}
              aria-label={sidebar ? "Collapse sidebar" : "Expand sidebar"}
              tabIndex={-1}
              className={cn(
                "group/edge absolute inset-y-0 left-0 z-[45] w-3 print:hidden",
                sidebar ? "-translate-x-1/2 cursor-w-resize" : "cursor-e-resize"
              )}
            >
              <span
                className={cn(
                  "absolute inset-y-0 w-0.5 bg-accent opacity-0 transition-opacity duration-200 group-hover/edge:opacity-100",
                  sidebar ? "left-1/2 -translate-x-1/2" : "left-0"
                )}
              />
            </button>
          )}
          {/* top bar */}
          <header
            className={cn(
              "group/top absolute inset-x-0 top-0 z-20 transition-all duration-500",
              chromeHidden ? "opacity-0 hover:opacity-100 focus-within:opacity-100" : typing ? "opacity-35 hover:opacity-100" : "opacity-100"
            )}
          >
            <div className="flex h-14 items-center justify-between gap-3 bg-gradient-to-b from-bg via-bg/85 to-transparent px-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  onClick={() => (focusMode ? setFocusMode(false) : setSidebar((s) => !s))}
                  title={`Toggle sidebar (${HOT} B)`}
                  aria-label="Toggle sidebar"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  <ISidebar size={17} />
                </button>
                {(!sidebar || isMobile || focusMode) && (
                  <span className="ml-1 font-serif text-[22px] leading-none animate-fade">
                    blank<span className="text-accent">.</span>
                  </span>
                )}
                {active && (
                  <div className="ml-2 hidden min-w-0 items-center gap-2 text-[13px] text-muted md:flex">
                    <span className="text-faint">/</span>
                    <span key={active.id} className="truncate animate-fade">
                      {displayTitle(active)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <SaveIndicator state={saveState} />
                {active && (
                  <>
                    <button
                      onClick={() => setFocusMode((f) => !f)}
                      title="Focus mode (Esc)"
                      aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-full transition-all hover:bg-ink/5 active:scale-90",
                        focusMode ? "text-accent" : "text-muted hover:text-ink"
                      )}
                    >
                      {focusMode ? <IX size={16} /> : <IFocus size={17} />}
                    </button>
                    <button
                      onClick={openShare}
                      title={`Share (${HOT} S)`}
                      className="group ml-1 flex h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-medium text-bg transition-all hover:shadow-soft active:scale-95 sm:px-4"
                    >
                      <IShare size={15} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* reading progress */}
            <div className="absolute inset-x-0 top-0 h-[2px]">
              <div className="h-full origin-left bg-accent transition-transform duration-150" style={{ transform: `scaleX(${progress})` }} />
            </div>
          </header>

          <div
            ref={setScroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              const max = el.scrollHeight - el.clientHeight;
              setProgress(max > 40 ? el.scrollTop / max : 0);
            }}
            className="scroll-thin flex-1 overflow-y-auto"
            onClick={(e) => {
              // clicking the empty canvas below the text focuses the body
              if (e.target === e.currentTarget) document.getElementById("note-body")?.focus();
            }}
          >
            {active ? (
              <Editor
                key={active.id}
                note={active}
                onChange={(patch) => update(active.id, patch)}
                onTyping={onTyping}
                typing={typing}
                focusMode={focusMode}
                autoFocus={pendingFocus?.id === active.id ? pendingFocus.target : null}
                media={<AttachmentStrip items={media.items} onAdd={() => imageInput?.click()} onRemove={media.remove} />}
              />
            ) : (
              <EmptyState onCreate={() => newNote()} />
            )}
          </div>

          {focusMode && (
            <div className="pointer-events-none fixed inset-x-0 top-16 z-10 flex justify-center animate-fade">
              <span className={cn("rounded-full border border-line bg-elev/70 px-3 py-1 text-[11px] text-faint backdrop-blur transition-opacity duration-700", typing && "opacity-0")}>
                Focus mode · <kbd>esc</kbd> to exit
              </span>
            </div>
          )}
        </main>

        <input
          ref={setImportInput}
          type="file"
          multiple
          accept=".json,.md,.markdown,.txt,text/plain,text/markdown,application/json"
          className="hidden"
          onChange={(e) => {
            onImport(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={setImageInput}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            attachImages(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        <DropOverlay show={dragging} />
        {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
        {sharing && active && <ShareModal note={active} onClose={() => setSharing(false)} />}
      </div>

      {active && (
        <div className="print-only">
          {active.title.trim() && <h1 style={{ font: "400 32px/1.15 'Instrument Serif', Georgia, serif", margin: "0 0 16px" }}>{active.title}</h1>}
          <div style={{ whiteSpace: "pre-wrap", font: "14px/1.7 Geist, system-ui, sans-serif" }}>{active.body}</div>
        </div>
      )}
      <Toaster />
    </>
  );
}
