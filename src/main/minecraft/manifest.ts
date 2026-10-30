import path from 'path';
import { promises as fs } from 'fs';
import { fetchJson } from '../http';
import { dirs, ensureDir, exists } from '../paths';
import type { McVersionInfo } from '../../shared/types';
import type { VersionJson } from './versionTypes';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

interface ManifestEntry {
  id: string;
  type: McVersionInfo['type'];
  url: string;
  sha1: string;
  releaseTime: string;
}
interface Manifest {
  latest: { release: string; snapshot: string };
  versions: ManifestEntry[];
}

let cached: Manifest | null = null;
let cachedAt = 0;

export async function getManifest(): Promise<Manifest> {
  if (cached && Date.now() - cachedAt < 10 * 60_000) return cached;
  const file = path.join(dirs.meta(), 'version_manifest_v2.json');
  try {
    cached = await fetchJson<Manifest>(MANIFEST_URL);
    cachedAt = Date.now();
    await ensureDir(dirs.meta());
    await fs.writeFile(file, JSON.stringify(cached));
  } catch (e) {
    // offline fallback
    if (await exists(file)) {
      cached = JSON.parse(await fs.readFile(file, 'utf-8'));
      cachedAt = Date.now();
    } else {
      throw e;
    }
  }
  return cached!;
}

export async function listMcVersions(includeSnapshots: boolean): Promise<McVersionInfo[]> {
  const m = await getManifest();
  return m.versions
    .filter((v) => v.type === 'release' || includeSnapshots)
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

export function versionJsonPath(id: string) {
  return path.join(dirs.versions(), id, `${id}.json`);
}
export function versionJarPath(id: string) {
  return path.join(dirs.versions(), id, `${id}.jar`);
}

/** Fetch + cache the vanilla version json for a given MC version. */
export async function getVanillaVersionJson(id: string): Promise<VersionJson> {
  const file = versionJsonPath(id);
  if (await exists(file)) {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  }
  const m = await getManifest();
  const entry = m.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Versão Minecraft desconhecida: ${id}`);
  const json = await fetchJson<VersionJson>(entry.url);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(json));
  return json;
}

/** Read any locally installed version json (vanilla or loader). */
export async function readLocalVersionJson(id: string): Promise<VersionJson> {
  const file = versionJsonPath(id);
  if (!(await exists(file))) throw new Error(`Version json não instalado: ${id}`);
  return JSON.parse(await fs.readFile(file, 'utf-8'));
}

/** Merge a version json chain (inheritsFrom) into a flat effective version. */
export async function resolveVersionChain(id: string): Promise<VersionJson> {
  const chain: VersionJson[] = [];
  let currentId: string | undefined = id;
  let guard = 0;
  while (currentId && guard++ < 8) {
    let json: VersionJson;
    try {
      json = await readLocalVersionJson(currentId);
    } catch {
      json = await getVanillaVersionJson(currentId);
    }
    chain.push(json);
    currentId = json.inheritsFrom;
  }
  // chain[0] = child ... chain[n-1] = root vanilla
  const root = chain[chain.length - 1];
  const merged: VersionJson = { ...root };
  for (let i = chain.length - 2; i >= 0; i--) {
    const c = chain[i];
    merged.id = c.id;
    if (c.mainClass) merged.mainClass = c.mainClass;
    if (c.minecraftArguments) merged.minecraftArguments = c.minecraftArguments;
    if (c.jar) merged.jar = c.jar;
    if (c.javaVersion) merged.javaVersion = c.javaVersion;
    if (c.assetIndex) merged.assetIndex = c.assetIndex;
    if (c.assets) merged.assets = c.assets;
    if (c.logging) merged.logging = c.logging;
    // child libraries FIRST so loader libs win classpath dedupe
    merged.libraries = [...(c.libraries ?? []), ...(merged.libraries ?? [])];
    if (c.arguments || merged.arguments) {
      merged.arguments = {
        game: [...(merged.arguments?.game ?? []), ...(c.arguments?.game ?? [])],
        jvm: [...(merged.arguments?.jvm ?? []), ...(c.arguments?.jvm ?? [])]
      };
    }
  }
  // the jar to use: explicit jar field, else deepest vanilla ancestor id
  if (!merged.jar) merged.jar = root.id;
  return merged;
}
