import path from 'path';
import { fetchJson, downloadFile } from '../http';
import { gameDir } from '../paths';
import { setModMeta, getModsMeta } from './meta';
import type { ContentSearchQuery, ContentSearchResult, ContentType, LoaderKind } from '../../shared/types';

const API = 'https://api.modrinth.com/v2';

const typeMap: Record<ContentType, string> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  modpack: 'modpack'
};

export interface MrVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  files: { url: string; filename: string; primary: boolean; size: number; hashes: { sha1?: string } }[];
  dependencies: { project_id?: string; version_id?: string; dependency_type: string }[];
}

const sortMap: Record<string, string> = {
  relevance: 'relevance',
  downloads: 'downloads',
  newest: 'newest',
  updated: 'updated'
};

export async function mrSearch(q: ContentSearchQuery): Promise<ContentSearchResult> {
  const facets: string[][] = [[`project_type:${typeMap[q.type]}`]];
  if (q.mcVersion) facets.push([`versions:${q.mcVersion}`]);
  if (q.loader && q.loader !== 'vanilla' && q.type !== 'resourcepack') facets.push([`categories:${q.loader}`]);
  for (const cat of q.categories ?? []) facets.push([`categories:${cat}`]);
  const pageSize = q.pageSize ?? 20;
  const params = new URLSearchParams({
    query: q.query,
    facets: JSON.stringify(facets),
    limit: String(pageSize),
    offset: String(q.page * pageSize),
    index: sortMap[q.sort ?? ''] ?? (q.query ? 'relevance' : 'downloads')
  });
  const res = await fetchJson<{
    hits: {
      project_id: string;
      slug: string;
      title: string;
      description: string;
      author: string;
      downloads: number;
      follows?: number;
      date_modified?: string;
      display_categories?: string[];
      categories?: string[];
      icon_url?: string;
    }[];
    total_hits: number;
  }>(`${API}/search?${params}`);
  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      source: 'modrinth',
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      follows: h.follows,
      updated: h.date_modified,
      categories: h.display_categories ?? h.categories,
      iconUrl: h.icon_url,
      type: q.type
    }))
  };
}

export async function mrListVersions(projectId: string, mcVersion?: string, loader?: LoaderKind): Promise<MrVersion[]> {
  const params = new URLSearchParams();
  if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]));
  if (loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]));
  return fetchJson<MrVersion[]>(`${API}/project/${projectId}/version?${params}`);
}

export function mrPickBestVersion(versions: MrVersion[]): MrVersion | undefined {
  return versions.sort((a, b) => b.date_published.localeCompare(a.date_published))[0];
}

export async function mrGetVersion(versionId: string): Promise<MrVersion> {
  return fetchJson<MrVersion>(`${API}/version/${versionId}`);
}

/**
 * Install a mod (or resourcepack) version into an instance, resolving required
 * dependencies recursively. Returns installed file names.
 */
export async function mrInstall(
  instanceId: string,
  projectId: string,
  type: ContentType,
  mcVersion: string,
  loader: LoaderKind,
  versionId?: string,
  depth = 0
): Promise<string[]> {
  if (depth > 8) return [];
  const meta = await getModsMeta(instanceId);
  if (!versionId && Object.values(meta).some((m) => m.source === 'modrinth' && m.projectId === projectId)) {
    return []; // already installed
  }
  const version = versionId
    ? await mrGetVersion(versionId)
    : mrPickBestVersion(await mrListVersions(projectId, mcVersion, type === 'mod' ? loader : undefined));
  if (!version) throw new Error('Nenhuma versão compatível encontrada no Modrinth.');
  const file = version.files.find((f) => f.primary) ?? version.files[0];
  if (!file) throw new Error('Versão sem ficheiros.');

  const subdir = type === 'resourcepack' ? 'resourcepacks' : 'mods';
  const dest = path.join(gameDir(instanceId), subdir, file.filename);
  await downloadFile({ url: file.url, dest, sha1: file.hashes.sha1, size: file.size });
  const installed = [file.filename];
  if (type === 'mod') {
    await setModMeta(instanceId, file.filename, {
      source: 'modrinth',
      projectId: version.project_id,
      versionId: version.id,
      name: version.name
    });
    for (const dep of version.dependencies ?? []) {
      if (dep.dependency_type === 'required' && dep.project_id) {
        try {
          installed.push(...(await mrInstall(instanceId, dep.project_id, 'mod', mcVersion, loader, dep.version_id ?? undefined, depth + 1)));
        } catch {
          /* optional: dependency may not have a matching version */
        }
      }
    }
  }
  return installed;
}
