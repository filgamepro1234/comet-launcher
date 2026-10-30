import path from 'path';
import { promises as fs } from 'fs';
import { fetchJson } from '../http';
import { dirs, ensureDir, exists } from '../paths';
import { versionJsonPath } from '../minecraft/manifest';
import type { LoaderVersionInfo } from '../../shared/types';
import type { VersionJson } from '../minecraft/versionTypes';

const META = {
  fabric: 'https://meta.fabricmc.net/v2',
  quilt: 'https://meta.quiltmc.org/v3'
} as const;

type Kind = keyof typeof META;

interface LoaderEntry {
  loader: { version: string; stable?: boolean };
}

export async function listFabricLikeVersions(kind: Kind, mcVersion: string): Promise<LoaderVersionInfo[]> {
  const list = await fetchJson<LoaderEntry[]>(`${META[kind]}/versions/loader/${encodeURIComponent(mcVersion)}`);
  return list.map((e) => ({ version: e.loader.version, stable: e.loader.stable !== false }));
}

export function fabricLikeVersionId(kind: Kind, loaderVersion: string, mcVersion: string) {
  return kind === 'fabric'
    ? `fabric-loader-${loaderVersion}-${mcVersion}`
    : `quilt-loader-${loaderVersion}-${mcVersion}`;
}

/** Install (write) the loader profile version json. Libraries download at launch. */
export async function installFabricLike(kind: Kind, mcVersion: string, loaderVersion: string): Promise<string> {
  const profile = await fetchJson<VersionJson>(
    `${META[kind]}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  );
  const id = profile.id ?? fabricLikeVersionId(kind, loaderVersion, mcVersion);
  profile.id = id;
  const file = versionJsonPath(id);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(profile, null, 2));
  return id;
}
