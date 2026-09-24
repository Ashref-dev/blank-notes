import { type ReactNode, useLayoutEffect, useRef } from "react";
import { cn } from "../utils/cn";
import { type Note, formatDate, relTime, wordCount } from "../lib/utils";
import { useNow } from "../hooks/misc";

type Props = {
  note: Note;
  onChange: (patch: Partial<Note>) => void;
  onTyping: () => void;
  typing: boolean;
  focusMode: boolean;
  autoFocus?: "title" | "body" | null;
  media?: ReactNode;
};

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = el.scrollHeight + "px";
}

function insert(ta: HTMLTextAreaElement, text: string) {
  ta.focus();
  // execCommand keeps native undo/redo intact
  const ok = document.execCommand && document.execCommand("insertText", false, text);
  if (!ok) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

const LIST = /^(\s*)((?:[-*•] \[[ xX]\])|[-*•]|\d+[.)])\s(.*)$/;

export default function Editor({ note, onChange, onTyping, typing, focusMode, autoFocus, media }: Props) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const now = useNow(20000);

  useLayoutEffect(() => {
    autosize(titleRef.current);
    autosize(bodyRef.current);
  }, [note.title, note.body, focusMode]);

  useLayoutEffect(() => {
    const onResize = () => {
      autosize(titleRef.current);
      autosize(bodyRef.current);
    };
    window.addEventListener("resize", onResize);
    // web fonts change line wrapping; re-measure once they're in
    document.fonts?.ready.then(onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    if (autoFocus === "title") titleRef.current?.focus();
    if (autoFocus === "body") {
      const b = bodyRef.current;
      if (b) {
        b.focus();
        b.setSelectionRange(b.value.length, b.value.length);
      }
    }
  }, [autoFocus]);

  const words = wordCount(note.body) + wordCount(note.title);
  const chars = note.body.length;
  const mins = Math.max(1, Math.round(words / 230));

  const onBodyKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onTyping();
    const ta = e.currentTarget;
    if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      insert(ta, "  ");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
      const { selectionStart: s, selectionEnd: en, value } = ta;
      if (s !== en) return;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const line = value.slice(lineStart, s);
      const m = line.match(LIST);
      if (!m) return;
      e.preventDefault();
      const [, indent, marker, content] = m;
      if (!content.trim()) {
        // empty item → end the list
        ta.setSelectionRange(lineStart, s);
        const ok = document.execCommand && document.execCommand("delete");
        if (!ok) {
          ta.setRangeText("", lineStart, s, "end");
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
      let next = marker;
      if (/^\d+/.test(marker)) next = parseInt(marker, 10) + 1 + marker.slice(-1);
      else if (marker.includes("[")) next = marker[0] + " [ ]";
      insert(ta, `\n${indent}${next} `);
    }
  };

  return (
    <article
      key={note.id}
      className={cn(
        "mx-auto w-full px-6 pb-[45vh] transition-[max-width,padding] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] sm:px-10",
        focusMode ? "max-w-[720px] pt-[20vh]" : "max-w-[700px] pt-[9vh] md:pt-[13vh]"
      )}
    >
      <div
        className={cn(
          "mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint transition-opacity duration-500 animate-rise",
          (typing || focusMode) && "opacity-40"
        )}
      >
        <span>{formatDate(note.createdAt)}</span>
        <span className="h-1 w-1 rounded-full bg-faint/60" />
        <span>Edited {relTime(note.updatedAt, now)}</span>
      </div>

      <textarea
        ref={titleRef}
        id="note-title"
        value={note.title}
        rows={1}
        spellCheck={false}
        placeholder="Untitled"
        onChange={(e) => onChange({ title: e.target.value.replace(/\r?\n/g, " ") })}
        onKeyDown={(e) => {
          onTyping();
          if (e.key === "Enter" || (e.key === "ArrowDown" && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
            e.preventDefault();
            const b = bodyRef.current;
            if (b) {
              b.focus();
              b.setSelectionRange(0, 0);
            }
          }
        }}
        className="block w-full resize-none overflow-hidden bg-transparent font-serif text-[44px] leading-[1.05] tracking-[-0.015em] text-ink outline-none placeholder:text-faint/70 animate-rise sm:text-[56px]"
        style={{ animationDelay: "60ms" }}
      />

      {media}

      <div className="relative mt-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <textarea
          ref={bodyRef}
          id="note-body"
          value={note.body}
          placeholder="Start typing. It saves itself."
          onChange={(e) => onChange({ body: e.target.value })}
          onKeyDown={onBodyKey}
          className="block min-h-[40vh] w-full resize-none overflow-hidden bg-transparent text-[17px] leading-[1.8] text-ink/90 outline-none placeholder:text-faint sm:text-[17.5px]"
        />
      </div>

      {/* floating stats */}
      <div
        className={cn(
          "pointer-events-none fixed bottom-5 left-1/2 z-10 -translate-x-1/2 transition-all duration-500 md:left-auto md:right-6 md:translate-x-0",
          typing ? "translate-y-2 opacity-0" : "opacity-100"
        )}
      >
        <div className="flex items-center gap-3 rounded-full border border-line bg-elev/80 px-4 py-1.5 font-mono text-[11px] whitespace-nowrap text-muted shadow-soft backdrop-blur-xl">
          <span>
            <span key={words} className="inline-block text-ink animate-pop">{words}</span> words
          </span>
          <span className="h-3 w-px bg-line" />
          <span>{chars} chars</span>
          <span className="h-3 w-px bg-line" />
          <span>{mins} min read</span>
        </div>
      </div>
    </article>
  );
}
