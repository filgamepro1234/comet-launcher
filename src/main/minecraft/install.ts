import path from 'path';
import { promises as fs } from 'fs';
import AdmZip from 'adm-zip';
import { dirs, ensureDir, exists } from '../paths';
import { downloadAll, downloadFile, fetchJson, type DownloadItem } from '../http';
import { getSettings } from '../store';
import { progressReporter } from '../tasks';
import { getVanillaVersionJson, resolveVersionChain, versionJarPath } from './manifest';
import { rulesAllow, nativeClassifier } from './rules';
import { mavenPath } from './maven';
import type { AssetIndexJson, Library, VersionJson } from './versionTypes';

const MOJANG_MAVEN = 'https://libraries.minecraft.net/';
const RESOURCES = 'https://resources.download.minecraft.net/';

export function libraryDiskPath(lib: Library, classifier?: string): string | null {
  if (classifier) {
    const art = lib.downloads?.classifiers?.[classifier];
    if (art?.path) return path.join(dirs.libraries(), ...art.path.split('/'));
    return path.join(dirs.libraries(), ...mavenPath(`${lib.name}:${classifier}`).split('/'));
  }
  const art = lib.downloads?.artifact;
  if (art?.path) return path.join(dirs.libraries(), ...art.path.split('/'));
  if (lib.name) return path.join(dirs.libraries(), ...mavenPath(lib.name).split('/'));
  return null;
}

function libraryDownloadItem(lib: Library, classifier?: string): DownloadItem | null {
  const dest = libraryDiskPath(lib, classifier);
  if (!dest) return null;
  if (classifier) {
    const art = lib.downloads?.classifiers?.[classifier];
    if (!art?.url) return null;
    return { url: art.url, dest, sha1: art.sha1, size: art.size };
  }
  const art = lib.downloads?.artifact;
  if (art?.url) return { url: art.url, dest, sha1: art.sha1, size: art.size };
  if (art && !art.url) return null; // explicit empty url => nothing to download (forge extracted locally)
  const base = lib.url ?? MOJANG_MAVEN;
  return { url: base.replace(/\/?$/, '/') + mavenPath(lib.name), dest };
}

/** Active libraries (rules applied) for the merged version json. */
export function activeLibraries(json: VersionJson): Library[] {
  return (json.libraries ?? []).filter((l) => rulesAllow(l.rules));
}

/** Download client jar, libraries (incl. natives) and assets for a *merged* version json. */
export async function installVersionFiles(merged: VersionJson, taskId: string): Promise<void> {
  const settings = await getSettings();
  const rep = progressReporter(taskId, `A instalar Minecraft ${merged.id}`);
  const items: DownloadItem[] = [];

  // client jar (belongs to the vanilla ancestor id in `jar`)
  const jarId = merged.jar ?? merged.id;
  const vanilla = await getVanillaVersionJson(jarId).catch(() => null);
  if (vanilla?.downloads?.client) {
    items.push({
      url: vanilla.downloads.client.url,
      dest: versionJarPath(jarId),
      sha1: vanilla.downloads.client.sha1,
      size: vanilla.downloads.client.size
    });
  }

  // libraries
  const natives: { lib: Library; classifier: string }[] = [];
  for (const lib of activeLibraries(merged)) {
    const item = libraryDownloadItem(lib);
    if (item) items.push(item);
    const cls = nativeClassifier(lib.natives);
    if (cls && lib.downloads?.classifiers?.[cls]) {
      const ni = libraryDownloadItem(lib, cls);
      if (ni) {
        items.push(ni);
        natives.push({ lib, classifier: cls });
      }
    }
  }

  // logging config
  if (merged.logging?.client?.file) {
    const f = merged.logging.client.file;
    items.push({
      url: f.url,
      dest: path.join(dirs.assets(), 'log_configs', f.id),
      sha1: f.sha1,
      size: f.size
    });
  }

  // asset index + objects
  let assetIndex: AssetIndexJson | null = null;
  if (merged.assetIndex) {
    const idxFile = path.join(dirs.assets(), 'indexes', `${merged.assetIndex.id}.json`);
    await downloadFile({ url: merged.assetIndex.url, dest: idxFile, sha1: merged.assetIndex.sha1 });
    assetIndex = JSON.parse(await fs.readFile(idxFile, 'utf-8'));
    const seen = new Set<string>();
    for (const obj of Object.values(assetIndex!.objects)) {
      if (seen.has(obj.hash)) continue;
      seen.add(obj.hash);
      const sub = obj.hash.slice(0, 2);
      items.push({
        url: `${RESOURCES}${sub}/${obj.hash}`,
        dest: path.join(dirs.assets(), 'objects', sub, obj.hash),
        sha1: obj.hash,
        size: obj.size
      });
    }
  }

  await downloadAll(items, settings.concurrentDownloads, (f, t, cur) =>
    rep.report(f, t, cur)
  );

  // Modern Forge/NeoForge exclude the vanilla jar from the JPMS module path via
  // -DignoreList=...,${version_name}.jar — that only matches if the client jar
  // file is NAMED after this (child) version id, like the official launcher does.
  // Otherwise the raw 1.x.x.jar becomes a duplicate "minecraft" module and boot
  // fails with java.lang.module.ResolutionException.
  if (jarId !== merged.id && JSON.stringify(merged.arguments?.jvm ?? []).includes('ignoreList')) {
    const src = versionJarPath(jarId);
    const dst = versionJarPath(merged.id);
    if ((await exists(src)) && !(await exists(dst))) {
      await ensureDir(path.dirname(dst));
      await fs.copyFile(src, dst);
    }
  }

  // legacy/virtual assets need real files laid out by name
  if (assetIndex && (assetIndex.virtual || assetIndex.map_to_resources) && merged.assetIndex) {
    const target = path.join(dirs.assets(), 'virtual', merged.assetIndex.id);
    for (const [name, obj] of Object.entries(assetIndex.objects)) {
      const src = path.join(dirs.assets(), 'objects', obj.hash.slice(0, 2), obj.hash);
      const dst = path.join(target, ...name.split('/'));
      if (!(await exists(dst))) {
        await ensureDir(path.dirname(dst));
        await fs.copyFile(src, dst);
      }
    }
  }

  // extract natives (legacy versions with classifiers)
  if (natives.length) {
    const nativesDir = path.join(dirs.versions(), merged.id, 'natives');
    await ensureDir(nativesDir);
    for (const { lib, classifier } of natives) {
      const jar = libraryDiskPath(lib, classifier)!;
      try {
        const zip = new AdmZip(jar);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          if (entry.entryName.startsWith('META-INF')) continue;
          const excluded = (lib.extract?.exclude ?? []).some((ex) => entry.entryName.startsWith(ex));
          if (excluded) continue;
          const out = path.join(nativesDir, path.basename(entry.entryName));
          await fs.writeFile(out, entry.getData());
        }
      } catch (e) {
        throw new Error(`Falha ao extrair natives de ${path.basename(jar)}: ${String(e)}`);
      }
    }
  }
  rep.done();
}

export function nativesDirFor(versionId: string) {
  return path.join(dirs.versions(), versionId, 'natives');
}

/** Full install for a version id (resolves inheritance first). */
export async function ensureVersionInstalled(versionId: string, taskId: string): Promise<VersionJson> {
  const merged = await resolveVersionChain(versionId);
  await installVersionFiles(merged, taskId);
  return merged;
}
