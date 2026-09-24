import { useCallback, useEffect, useState } from "react";
import { type Attachment, deleteAttachment, isQuotaError, listAttachments, makeAttachment, putAttachment } from "../lib/attachments";
import { toast } from "../lib/toast";

type State = { noteId: string | null; items: Attachment[]; status: "loading" | "ready" | "unavailable" };

export function useAttachments(noteId: string | null) {
  const [state, setState] = useState<State>({ noteId: null, items: [], status: "loading" });

  useEffect(() => {
    if (!noteId) return;
    let alive = true;
    setState({ noteId, items: [], status: "loading" });
    listAttachments(noteId)
      .then((items) => alive && setState({ noteId, items, status: "ready" }))
      .catch(() => alive && setState({ noteId, items: [], status: "unavailable" }));
    return () => {
      alive = false;
    };
  }, [noteId]);

  const current = state.noteId === noteId ? state : { noteId, items: [], status: "loading" as const };

  const add = useCallback(
    async (files: File[]) => {
      if (!noteId || !files.length) return;
      if (state.status === "unavailable") {
        toast({ message: "Images can't be stored in this browser", icon: "info" });
        return;
      }
      let added = 0;
      for (const file of files) {
        const a = makeAttachment(noteId, file);
        setState((s) => (s.noteId === noteId ? { ...s, items: [...s.items, a] } : s));
        try {
          await putAttachment(a);
          added++;
        } catch (e) {
          setState((s) => (s.noteId === noteId ? { ...s, items: s.items.filter((x) => x.id !== a.id) } : s));
          toast({ message: isQuotaError(e) ? "Storage full — remove images to free space" : "Couldn't save that image", icon: "info" });
          break;
        }
      }
      if (added) toast({ message: added === 1 ? "Image attached" : `${added} images attached`, icon: "check", duration: 1800 });
    },
    [noteId, state.status]
  );

  const remove = useCallback(async (a: Attachment) => {
    setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== a.id) }));
    try {
      await deleteAttachment(a.id);
    } catch {
      setState((s) => (s.noteId === a.noteId ? { ...s, items: [...s.items, a].sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt)) } : s));
      toast({ message: "Couldn't remove that image", icon: "info" });
    }
  }, []);

  return { items: current.items, status: current.status, add, remove };
}
