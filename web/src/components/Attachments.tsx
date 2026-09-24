import { useEffect, useState } from "react";
import type { Attachment } from "../lib/attachments";
import { toast } from "../lib/toast";
import { formatBytes } from "../lib/utils";
import { ICopy, IDownload, IPlus, IX } from "./Icons";

function useObjectUrl(blob: Blob) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function saveBlob(a: Attachment) {
  const url = URL.createObjectURL(a.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = a.filename || "image";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyImage(a: Attachment) {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("unsupported");
    // Most browsers only accept PNG on the clipboard.
    const png = a.blob.type === "image/png" ? a.blob : await toPng(a.blob);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    toast({ message: "Image copied", icon: "check", duration: 1800 });
  } catch {
    toast({ message: "Clipboard unavailable — downloaded instead", icon: "download" });
    saveBlob(a);
  }
}

async function toPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png"));
}

const action =
  "grid h-7 w-7 place-items-center rounded-full text-ink/80 transition-colors hover:bg-ink/10 hover:text-ink";

function Tile({ a, onOpen, onRemove }: { a: Attachment; onOpen: (a: Attachment) => void; onRemove: (a: Attachment) => void }) {
  const url = useObjectUrl(a.blob);
  const [broken, setBroken] = useState(false);
  return (
    <figure className="group relative w-36 shrink-0 animate-scale-in sm:w-40">
      <button
        onClick={() => onOpen(a)}
        className="block h-28 w-full overflow-hidden rounded-2xl border border-line bg-elev shadow-soft transition-transform duration-300 hover:-translate-y-0.5"
        title={a.filename}
      >
        {url && !broken ? (
          <img src={url} alt={a.filename} onError={() => setBroken(true)} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="grid h-full place-items-center text-[11px] text-faint">{broken ? "Preview unavailable" : ""}</span>
        )}
      </button>
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full border border-line bg-elev/90 p-0.5 opacity-0 shadow-soft backdrop-blur transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        <button onClick={() => copyImage(a)} title="Copy image" aria-label="Copy image" className={action}>
          <ICopy size={13} />
        </button>
        <button onClick={() => saveBlob(a)} title="Download image" aria-label="Download image" className={action}>
          <IDownload size={13} />
        </button>
        <button onClick={() => onRemove(a)} title="Remove image" aria-label="Remove image" className={action + " hover:!bg-red-500/10 hover:!text-red-500"}>
          <IX size={13} />
        </button>
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between gap-2 px-1 font-mono text-[10px] text-faint">
        <span className="truncate">{a.filename}</span>
        <span className="shrink-0">{formatBytes(a.size || a.blob.size)}</span>
      </figcaption>
    </figure>
  );
}

export function AttachmentStrip({
  items,
  onAdd,
  onRemove,
}: {
  items: Attachment[];
  onAdd: () => void;
  onRemove: (a: Attachment) => void;
}) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (!items.length) return null;
  return (
    <>
      <div className="scroll-thin -mx-1 mt-6 flex gap-3 overflow-x-auto px-1 pt-1 pb-2">
        {items.map((a) => (
          <Tile key={a.id} a={a} onOpen={setOpen} onRemove={onRemove} />
        ))}
        <button
          onClick={onAdd}
          title="Attach image"
          className="grid h-28 w-20 shrink-0 place-items-center rounded-2xl border border-dashed border-line text-faint transition-colors hover:border-accent/50 hover:text-accent"
        >
          <IPlus size={18} />
        </button>
      </div>
      {open && <Lightbox a={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ a, onClose }: { a: Attachment; onClose: () => void }) {
  const url = useObjectUrl(a.blob);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade" />
      {url && <img src={url} alt={a.filename} className="relative max-h-[86vh] max-w-full rounded-2xl shadow-soft animate-scale-in" />}
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-elev/90 text-ink shadow-soft">
        <IX size={16} />
      </button>
    </div>
  );
}

export function DropOverlay({ show }: { show: boolean }) {
  return (
    <div
      className={
        "pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-[28px] border-2 border-dashed border-accent/60 bg-accent/[0.06] backdrop-blur-[2px] transition-opacity duration-200 " +
        (show ? "opacity-100" : "opacity-0")
      }
    >
      <p className="font-serif text-[34px] italic text-accent">Drop to attach</p>
    </div>
  );
}
