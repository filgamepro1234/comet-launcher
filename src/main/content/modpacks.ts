import path from 'path';
import { promises as fs } from 'fs';
import AdmZip from 'adm-zip';
import { gameDir, ensureDir, dirs } from '../paths';
import { downloadAll, downloadFile, type DownloadItem } from '../http';
import { getSettings } from '../store';
import { newTaskId, progressReporter } from '../tasks';
import { createInstance } from '../instances';
import { mrListVersions, mrPickBestVersion, mrGetVersion, type MrVersion } from './modrinth';
import { cfGetFile, cfGetFiles, cfDownloadUrl } from './curseforge';
import { setModMeta } from './meta';
import type { InstanceConfig, LoaderKind } from '../../shared/types';

interface MrIndex {
  name: string;
  versionId: string;
  dependencies: Record<string, string>; // minecraft, fabric-loader, quilt-loader, forge, neoforge
  files: {
    path: string;
    downloads: string[];
    hashes: { sha1?: string };
    fileSize?: number;
    env?: { client?: 'required' | 'optional' | 'unsupported' };
  }[];
}

function loaderFromDeps(deps: Record<string, string>): { loader: LoaderKind; loaderVersion?: string } {
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'] };
  if (deps['quilt-loader']) return { loader: 'quilt', loaderVersion: deps['quilt-loader'] };
  if (deps['neoforge']) return { loader: 'neoforge', loaderVersion: deps['neoforge'] };
  if (deps['forge']) return { loader: 'forge', loaderVersion: deps['forge'] };
  return { loader: 'vanilla' };
}

async function extractOverrides(zip: AdmZip, prefixes: string[], targetGameDir: string) {
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    for (const prefix of prefixes) {
      if (entry.entryName.startsWith(prefix + '/')) {
        const rel = entry.entryName.slice(prefix.length + 1);
        if (!rel || rel.includes('..')) continue;
        const dest = path.join(targetGameDir, ...rel.split('/'));
        await ensureDir(path.dirname(dest));
        await fs.writeFile(dest, entry.getData());
        break;
      }
    }
  }
}

/** Import a local .mrpack file into a brand-new instance. */
export async function importMrpack(filePath: string): Promise<InstanceConfig> {
  const zip = new AdmZip(filePath);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('Ficheiro .mrpack inválido (falta modrinth.index.json).');
  const index: MrIndex = JSON.parse(indexEntry.getData().toString('utf-8'));
  const mc = index.dependencies['minecraft'];
  if (!mc) throw new Error('Modpack sem versão de Minecraft definida.');
  const { loader, loaderVersion } = loaderFromDeps(index.dependencies);

  const inst = await createInstance({ name: index.name || path.basename(filePath), mcVersion: mc, loader, loaderVersion });
  const gdir = gameDir(inst.id);
  const taskId = newTaskId('mrpack');
  const rep = progressReporter(taskId, `A importar modpack "${inst.name}"`);
  const settings = await getSettings();

  const items: DownloadItem[] = [];
  for (const f of index.files) {
    if (f.env?.client === 'unsupported') continue;
    if (!f.downloads?.length || f.path.includes('..')) continue;
    items.push({
      url: f.downloads[0],
      dest: path.join(gdir, ...f.path.split('/')),
      sha1: f.hashes?.sha1,
      size: f.fileSize
    });
  }
  await downloadAll(items, settings.concurrentDownloads, (a, b, cur) => rep.report(a, b, cur));
  await extractOverrides(zip, ['overrides', 'client-overrides'], gdir);
  rep.done();
  return inst;
}

/** Install a Modrinth modpack by project id (downloads the .mrpack then imports). */
export async function installMrModpack(projectId: string, versionId?: string): Promise<InstanceConfig> {
  const version: MrVersion | undefined = versionId
    ? await mrGetVersion(versionId)
    : mrPickBestVersion(await mrListVersions(projectId));
  if (!version) throw new Error('Nenhuma versão do modpack encontrada.');
  const file = version.files.find((f) => f.primary) ?? version.files[0];
  const tmp = path.join(dirs.cache(), file.filename);
  await downloadFile({ url: file.url, dest: tmp, sha1: file.hashes.sha1, size: file.size });
  return importMrpack(tmp);
}

interface CfManifest {
  name: string;
  version?: string;
  minecraft: { version: string; modLoaders: { id: string; primary?: boolean }[] };
  files: { projectID: number; fileID: number; required: boolean }[];
  overrides?: string;
}

/** Import a CurseForge modpack zip (manifest.json format). */
export async function importCurseForgeZip(filePath: string): Promise<InstanceConfig> {
  const zip = new AdmZip(filePath);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) throw new Error('Zip inválido: falta manifest.json (formato CurseForge).');
  const manifest: CfManifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
  const mc = manifest.minecraft.version;
  const loaderId = manifest.minecraft.modLoaders.find((l) => l.primary)?.id ?? manifest.minecraft.modLoaders[0]?.id ?? '';
  let loader: LoaderKind = 'vanilla';
  let loaderVersion: string | undefined;
  const dash = loaderId.indexOf('-');
  if (dash > 0) {
    const kind = loaderId.slice(0, dash);
    loaderVersion = loaderId.slice(dash + 1);
    if (kind === 'forge' || kind === 'fabric' || kind === 'quilt' || kind === 'neoforge') loader = kind;
  }

  const inst = await createInstance({ name: manifest.name || path.basename(filePath), mcVersion: mc, loader, loaderVersion });
  const gdir = gameDir(inst.id);
  const taskId = newTaskId('cfpack');
  const rep = progressReporter(taskId, `A importar modpack "${inst.name}"`);

  let done = 0;
  const total = manifest.files.length;
  const failures: string[] = [];
  const queue = [...manifest.files];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const f = queue.shift();
      if (!f) return;
      try {
        const file = await cfGetFile(f.projectID, f.fileID);
        const dest = path.join(gdir, 'mods', file.fileName);
        await downloadFile({ url: cfDownloadUrl(file), dest, size: file.fileLength });
        await setModMeta(inst.id, file.fileName, {
          source: 'curseforge',
          projectId: String(f.projectID),
          versionId: String(f.fileID),
          name: file.displayName
        });
      } catch (e) {
        failures.push(`${f.projectID}:${f.fileID}`);
      }
      done++;
      rep.report(done, total);
    }
  });
  await Promise.all(workers);
  await extractOverrides(zip, [manifest.overrides ?? 'overrides'], gdir);
  rep.done();
  if (failures.length) {
    throw new Error(`Modpack importado, mas ${failures.length} mods falharam (autor bloqueou download via API).`);
  }
  return inst;
}

/** Install a CurseForge modpack by project id. */
export async function installCfModpack(projectId: string, fileId?: number): Promise<InstanceConfig> {
  let file;
  if (fileId) file = await cfGetFile(Number(projectId), fileId);
  else {
    const files = await cfGetFiles(projectId);
    file = files.sort((a, b) => b.fileDate.localeCompare(a.fileDate))[0];
  }
  if (!file) throw new Error('Nenhum ficheiro do modpack encontrado.');
  const tmp = path.join(dirs.cache(), file.fileName);
  await downloadFile({ url: cfDownloadUrl(file), dest: tmp, size: file.fileLength });
  return importCurseForgeZip(tmp);
}

/** Dispatch by file extension. */
export async function importModpackFile(filePath: string): Promise<InstanceConfig> {
  if (filePath.toLowerCase().endsWith('.mrpack')) return importMrpack(filePath);
  return importCurseForgeZip(filePath);
}
