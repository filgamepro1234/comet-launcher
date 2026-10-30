import path from 'path';
import { instanceDir } from '../paths';
import { readJson, writeJson } from '../store';

export interface InstalledFileMeta {
  source: 'modrinth' | 'curseforge';
  projectId: string;
  versionId: string;
  name?: string;
}

/** fileName -> metadata, stored per instance so updates/dedup work. */
export type ModsMeta = Record<string, InstalledFileMeta>;

const metaFile = (instanceId: string) => path.join(instanceDir(instanceId), 'mods-meta.json');

export async function getModsMeta(instanceId: string): Promise<ModsMeta> {
  return readJson<ModsMeta>(metaFile(instanceId), {});
}

export async function setModMeta(instanceId: string, fileName: string, meta: InstalledFileMeta) {
  const all = await getModsMeta(instanceId);
  all[fileName] = meta;
  await writeJson(metaFile(instanceId), all);
}

export async function removeModMeta(instanceId: string, fileName: string) {
  const all = await getModsMeta(instanceId);
  delete all[fileName];
  delete all[fileName.replace(/\.disabled$/, '')];
  await writeJson(metaFile(instanceId), all);
}

export async function renameModMeta(instanceId: string, from: string, to: string) {
  const all = await getModsMeta(instanceId);
  if (all[from]) {
    all[to] = all[from];
    delete all[from];
    await writeJson(metaFile(instanceId), all);
  }
}
