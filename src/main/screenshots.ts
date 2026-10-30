import path from 'path';
import { promises as fs } from 'fs';
import { shell } from 'electron';
import { gameDir, ensureDir } from './paths';
import type { ScreenshotInfo } from '../shared/types';

const shotsDir = (instanceId: string) => path.join(gameDir(instanceId), 'screenshots');

export async function listScreenshots(instanceId: string): Promise<ScreenshotInfo[]> {
  const dir = shotsDir(instanceId);
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
  const out: ScreenshotInfo[] = [];
  for (const f of files) {
    const st = await fs.stat(path.join(dir, f));
    out.push({
      name: f,
      url: `media://screenshots/${encodeURIComponent(instanceId)}/${encodeURIComponent(f)}`,
      mtime: st.mtimeMs,
      size: st.size
    });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export async function deleteScreenshot(instanceId: string, name: string) {
  await fs.rm(path.join(shotsDir(instanceId), path.basename(name)), { force: true });
}

export async function openScreenshotsFolder(instanceId: string) {
  await ensureDir(shotsDir(instanceId));
  await shell.openPath(shotsDir(instanceId));
}

/** media://screenshots/<instanceId>/<file> -> absolute path (validated). */
export function resolveMediaUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'screenshots') return null;
    const [instanceId, file] = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (!instanceId || !file) return null;
    const safe = path.basename(file);
    const full = path.join(shotsDir(instanceId), safe);
    return full;
  } catch {
    return null;
  }
}
