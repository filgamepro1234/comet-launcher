import { BrowserWindow } from 'electron';
import type { TaskProgress } from '../shared/types';

export function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

let seq = 0;
export function newTaskId(prefix: string) {
  return `${prefix}-${Date.now()}-${seq++}`;
}

export function emitProgress(p: TaskProgress) {
  broadcast('task:progress', p);
}

/** Helper that throttles progress updates to ~10/s per task. */
export function progressReporter(taskId: string, label: string) {
  let last = 0;
  return {
    report(current: number, total: number, detail?: string) {
      const now = Date.now();
      if (now - last < 100 && current < total) return;
      last = now;
      emitProgress({ taskId, label, current, total, detail });
    },
    done() {
      emitProgress({ taskId, label, current: 1, total: 1, done: true });
    },
    fail(error: string) {
      emitProgress({ taskId, label, current: 0, total: 1, done: true, error });
    }
  };
}
