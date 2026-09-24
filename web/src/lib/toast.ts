import { useSyncExternalStore } from "react";

export type Toast = {
  id: number;
  message: string;
  icon?: "check" | "trash" | "link" | "pin" | "info" | "download";
  action?: { label: string; run: () => void };
  duration?: number;
};

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Omit<Toast, "id">) {
  const id = ++seq;
  toasts = [...toasts.slice(-2), { ...t, id }];
  emit();
  setTimeout(() => dismiss(id), t.duration ?? 3200);
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts
  );
}
