import { createWriteStream, promises as fs } from 'fs';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import { ensureDir, exists } from './paths';

const UA = 'CometLauncher/0.1.0 (github.com/comet-launcher)';

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return (await res.json()) as T;
}

export async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.text();
}

export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} em ${url}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function postForm<T>(url: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
  });
  // caller inspects error payloads (OAuth polling returns 400 while pending)
  return (await res.json()) as T;
}

export async function sha1File(file: string): Promise<string> {
  const hash = createHash('sha1');
  const data = await fs.readFile(file);
  hash.update(data);
  return hash.digest('hex');
}

export interface DownloadItem {
  url: string;
  dest: string;
  sha1?: string;
  size?: number;
  headers?: Record<string, string>;
}

/** Download a single file with verification + retries. Skips if already valid. */
export async function downloadFile(item: DownloadItem): Promise<boolean> {
  const { url, dest, sha1, size, headers } = item;
  if (await exists(dest)) {
    try {
      if (sha1) {
        if ((await sha1File(dest)) === sha1.toLowerCase()) return false;
      } else if (size !== undefined) {
        const st = await fs.stat(dest);
        if (st.size === size) return false;
      } else {
        return false;
      }
    } catch {
      /* re-download */
    }
  }
  await ensureDir(path.dirname(dest));
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...(headers ?? {}) } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} em ${url}`);
      const tmp = dest + '.part';
      await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), createWriteStream(tmp));
      if (sha1) {
        const got = await sha1File(tmp);
        if (got !== sha1.toLowerCase()) throw new Error(`SHA1 inválido para ${url}`);
      }
      await fs.rm(dest, { force: true });
      await fs.rename(tmp, dest);
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Download many files with bounded concurrency; reports progress via callback. */
export async function downloadAll(
  items: DownloadItem[],
  concurrency: number,
  onProgress?: (finished: number, total: number, current?: string) => void
): Promise<void> {
  let finished = 0;
  let index = 0;
  const errors: unknown[] = [];
  const total = items.length;
  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= total) return;
      const item = items[i];
      try {
        await downloadFile(item);
      } catch (e) {
        errors.push(e);
        if (errors.length > 5) return;
      }
      finished++;
      onProgress?.(finished, total, path.basename(item.dest));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  if (errors.length) {
    throw new Error(`${errors.length} downloads falharam. Primeiro erro: ${String((errors[0] as Error)?.message ?? errors[0])}`);
  }
}
