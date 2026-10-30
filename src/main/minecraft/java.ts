import path from 'path';
import { promises as fs } from 'fs';
import { dirs, ensureDir, exists } from '../paths';
import { downloadAll, fetchJson, type DownloadItem } from '../http';
import { getSettings } from '../store';
import { progressReporter } from '../tasks';

const RUNTIME_MANIFEST =
  'https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

/** Keys used by Mojang's java-runtime manifest, most specific first. */
function platformKeys(): string[] {
  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return ['windows-arm64', 'windows-x64'];
    if (process.arch === 'ia32') return ['windows-x86'];
    return ['windows-x64'];
  }
  if (process.platform === 'darwin') return process.arch === 'arm64' ? ['mac-os-arm64', 'mac-os'] : ['mac-os'];
  return process.arch === 'ia32' ? ['linux-i386'] : ['linux'];
}

/** Path of the java binary inside an extracted Mojang runtime. */
function runtimeJavaPath(base: string): string {
  if (process.platform === 'win32') return path.join(base, 'bin', 'javaw.exe');
  if (process.platform === 'darwin') return path.join(base, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(base, 'bin', 'java');
}

interface RuntimeFileEntry {
  type: 'file' | 'directory' | 'link';
  downloads?: { raw?: { url: string; sha1: string; size: number }; lzma?: unknown };
  executable?: boolean;
  target?: string;
}
interface RuntimeManifestAll {
  [platform: string]: {
    [component: string]: { manifest: { url: string } }[];
  };
}

/**
 * Ensure the Mojang JRE component (e.g. "java-runtime-gamma", "jre-legacy") is
 * installed; returns the java binary path. Falls back to user-configured java.
 */
export async function ensureJavaRuntime(component: string, taskId: string): Promise<string> {
  const settings = await getSettings();
  const base = path.join(dirs.java(), component);
  const java = runtimeJavaPath(base);
  const marker = path.join(base, '.complete');
  if (await exists(marker)) return java;

  const rep = progressReporter(taskId, `A descarregar Java (${component})`);
  try {
    const all = await fetchJson<RuntimeManifestAll>(RUNTIME_MANIFEST);
    const entries = platformKeys()
      .map((k) => all[k]?.[component])
      .find((e) => e?.length);
    if (!entries?.length) throw new Error(`Runtime Java "${component}" indisponível para ${platformKeys()[0]}`);
    const manifest = await fetchJson<{ files: Record<string, RuntimeFileEntry> }>(entries[0].manifest.url);
    const items: DownloadItem[] = [];
    const executables: string[] = [];
    const links: [string, string][] = [];
    for (const [rel, entry] of Object.entries(manifest.files)) {
      const dest = path.join(base, ...rel.split('/'));
      if (entry.type === 'link' && entry.target) {
        links.push([dest, entry.target]);
        continue;
      }
      if (entry.type !== 'file' || !entry.downloads?.raw) continue;
      items.push({ url: entry.downloads.raw.url, dest, sha1: entry.downloads.raw.sha1, size: entry.downloads.raw.size });
      if (entry.executable) executables.push(dest);
    }
    await downloadAll(items, settings.concurrentDownloads, (f, t, cur) => rep.report(f, t, cur));
    if (process.platform !== 'win32') {
      for (const f of executables) await fs.chmod(f, 0o755);
      for (const [dest, target] of links) {
        await ensureDir(path.dirname(dest));
        await fs.symlink(target, dest).catch(() => {});
      }
    }
    await fs.writeFile(marker, 'ok');
    rep.done();
    return java;
  } catch (e) {
    rep.fail(String(e));
    // fallback: user-provided java
    if (settings.javaPath && (await exists(settings.javaPath))) return settings.javaPath;
    throw e;
  }
}

/** Console java next to javaw on Windows (installers need visible output); same binary elsewhere. */
export function javaExeFromJavaw(javaw: string) {
  return javaw.toLowerCase().endsWith('javaw.exe') ? path.join(path.dirname(javaw), 'java.exe') : javaw;
}
