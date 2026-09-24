import { dismiss, useToasts } from "../lib/toast";
import { ICheck, IDownload, ILink, IPin, ISparkle, ITrash } from "./Icons";

const icons = {
  check: <ICheck size={14} />,
  trash: <ITrash size={14} />,
  link: <ILink size={14} />,
  pin: <IPin size={14} />,
  info: <ISparkle size={14} />,
  download: <IDownload size={14} />,
};

export default function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] print:hidden flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-4 text-[13px] text-bg shadow-soft animate-toast"
        >
          <span className="text-accent">{icons[t.icon ?? "check"]}</span>
          <span className="max-w-[60vw] truncate">{t.message}</span>
          {t.action ? (
            <button
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
              className="rounded-full bg-bg/15 px-3 py-1 text-[12px] font-medium transition-colors hover:bg-bg/25"
            >
              {t.action.label}
            </button>
          ) : (
            <span className="w-2" />
          )}
        </div>
      ))}
    </div>
  );
}
