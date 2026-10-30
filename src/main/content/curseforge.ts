import path from 'path';
import { fetchJson, downloadFile } from '../http';
import { gameDir } from '../paths';
import { getSettings } from '../store';
import { setModMeta } from './meta';
import type { ContentSearchQuery, ContentSearchResult, ContentType, LoaderKind } from '../../shared/types';

const API = 'https://api.curseforge.com/v1';
const GAME_ID = 432; // Minecraft

const classIds: Record<ContentType, number> = {
  mod: 6,
  resourcepack: 12,
  modpack: 4471
};

const loaderTypes: Partial<Record<LoaderKind, number>> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
};

async function cfHeaders(): Promise<Record<string, string>> {
  const s = await getSettings();
  if (!s.curseforgeApiKey?.trim()) {
    throw new Error('CF_KEY_MISSING: Configura a API key do CurseForge nas Definições (console.curseforge.com).');
  }
  return { 'x-api-key': s.curseforgeApiKey.trim() };
}

export interface CfFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  downloadUrl?: string | null;
  fileLength: number;
  fileDate: string;
  gameVersions: string[];
  dependencies: { modId: number; relationType: number }[];
}

export function cfDownloadUrl(file: CfFile): string {
  if (file.downloadUrl) return file.downloadUrl;
  // Fallback CDN pattern for files where the author allows distribution
  const id = String(file.id);
  return `https://edge.forgecdn.net/files/${Number(id.slice(0, 4))}/${Number(id.slice(4))}/${encodeURIComponent(file.fileName)}`;
}

// ModsSearchSortField: 2=Popularity 3=LastUpdated 6=TotalDownloads 11=ReleasedDate
const cfSortMap: Record<string, string> = {
  relevance: '2',
  downloads: '6',
  newest: '11',
  updated: '3'
};

export async function cfSearch(q: ContentSearchQuery): Promise<ContentSearchResult> {
  const headers = await cfHeaders();
  const pageSize = q.pageSize ?? 20;
  const params = new URLSearchParams({
    gameId: String(GAME_ID),
    classId: String(classIds[q.type]),
    searchFilter: q.query,
    pageSize: String(pageSize),
    index: String(q.page * pageSize),
    sortField: cfSortMap[q.sort ?? ''] ?? '2',
    sortOrder: 'desc'
  });
  if (q.mcVersion) params.set('gameVersion', q.mcVersion);
  const lt = q.loader && q.type === 'mod' ? loaderTypes[q.loader] : undefined;
  if (lt) params.set('modLoaderType', String(lt));
  const res = await fetchJson<{
    data: {
      id: number;
      slug: string;
      name: string;
      summary: string;
      downloadCount: number;
      thumbsUpCount?: number;
      dateModified?: string;
      categories?: { name: string }[];
      logo?: { thumbnailUrl?: string };
      authors: { name: string }[];
    }[];
    pagination: { totalCount: number };
  }>(`${API}/mods/search?${params}`, headers);
  return {
    total: res.pagination.totalCount,
    hits: res.data.map((d) => ({
      source: 'curseforge',
      projectId: String(d.id),
      slug: d.slug,
      title: d.name,
      description: d.summary,
      author: d.authors[0]?.name ?? '',
      downloads: d.downloadCount,
      updated: d.dateModified,
      categories: d.categories?.map((c) => c.name).slice(0, 4),
      iconUrl: d.logo?.thumbnailUrl,
      type: q.type
    }))
  };
}

export async function cfGetFiles(modId: string, mcVersion?: string, loader?: LoaderKind): Promise<CfFile[]> {
  const headers = await cfHeaders();
  const params = new URLSearchParams({ pageSize: '50' });
  if (mcVersion) params.set('gameVersion', mcVersion);
  const lt = loader ? loaderTypes[loader] : undefined;
  if (lt) params.set('modLoaderType', String(lt));
  const res = await fetchJson<{ data: CfFile[] }>(`${API}/mods/${modId}/files?${params}`, headers);
  return res.data;
}

export async function cfGetFile(modId: number, fileId: number): Promise<CfFile> {
  const headers = await cfHeaders();
  const res = await fetchJson<{ data: CfFile }>(`${API}/mods/${modId}/files/${fileId}`, headers);
  return res.data;
}

export async function cfInstall(
  instanceId: string,
  projectId: string,
  type: ContentType,
  mcVersion: string,
  loader: LoaderKind,
  fileId?: number,
  depth = 0
): Promise<string[]> {
  if (depth > 8) return [];
  let file: CfFile | undefined;
  if (fileId) {
    file = await cfGetFile(Number(projectId), fileId);
  } else {
    const files = await cfGetFiles(projectId, mcVersion, type === 'mod' ? loader : undefined);
    file = files.sort((a, b) => b.fileDate.localeCompare(a.fileDate))[0];
  }
  if (!file) throw new Error('Nenhum ficheiro compatível no CurseForge.');
  const subdir = type === 'resourcepack' ? 'resourcepacks' : 'mods';
  const dest = path.join(gameDir(instanceId), subdir, file.fileName);
  await downloadFile({ url: cfDownloadUrl(file), dest, size: file.fileLength });
  const installed = [file.fileName];
  if (type === 'mod') {
    await setModMeta(instanceId, file.fileName, {
      source: 'curseforge',
      projectId: String(file.modId),
      versionId: String(file.id),
      name: file.displayName
    });
    for (const dep of file.dependencies ?? []) {
      if (dep.relationType === 3 /* required */) {
        try {
          installed.push(...(await cfInstall(instanceId, String(dep.modId), 'mod', mcVersion, loader, undefined, depth + 1)));
        } catch {
          /* skip unresolvable deps */
        }
      }
    }
  }
  return installed;
}
