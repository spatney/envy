const KEY = 'graphein.learn.progress.v1';

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function write(set: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* ignore quota / disabled storage */
  }
}

const listeners = new Set<() => void>();
// Cached, stable snapshot so useSyncExternalStore doesn't loop. Only swapped on change.
let snapshot: Set<string> = read();
function emit() {
  snapshot = read();
  for (const fn of listeners) fn();
}

export const progress = {
  isDone(id: string): boolean {
    return snapshot.has(id);
  },
  complete(id: string) {
    const set = read();
    if (!set.has(id)) {
      set.add(id);
      write(set);
      emit();
    }
  },
  reset(id: string) {
    const set = read();
    if (set.delete(id)) {
      write(set);
      emit();
    }
  },
  clearAll() {
    write(new Set());
    emit();
  },
  all(): Set<string> {
    return snapshot;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
