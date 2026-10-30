import path from 'path';
import { promises as fs } from 'fs';
import AdmZip from 'adm-zip';
import { gameDir } from '../paths';
import { getModsMeta, removeModMeta, renameModMeta } from './meta';
import { mrListVersions, mrPickBestVersion, mrInstall } from './modrinth';
import { cfGetFiles, cfInstall } from './curseforge';
import { getInstance } from '../instances';
import type { LocalMod, ModUpdateInfo } from '../../shared/types';

const modsDir = (instanceId: string) => path.join(gameDir(instanceId), 'mods');

interface JarInfo {
  modId?: string;
  name?: string;
  version?: string;
}

/** Best-effort metadata extraction from fabric.mod.json / quilt.mod.json / mods.toml. */
function parseJarInfo(jarPath: string): JarInfo {
  try {
    const zip = new AdmZip(jarPath);
    const fabric = zip.getEntry('fabric.mod.json');
    if (fabric) {
      const j = JSON.parse(fabric.getData().toString('utf-8'));
      return { modId: j.id, name: j.name ?? j.id, version: j.version };
    }
    const quilt = zip.getEntry('quilt.mod.json');
    if (quilt) {
      const j = JSON.parse(quilt.getData().toString('utf-8'));
      const ql = j.quilt_loader ?? {};
      return { modId: ql.id, name: ql.metadata?.name ?? ql.id, version: ql.version };
    }
    const toml = zip.getEntry('META-INF/mods.toml') ?? zip.getEntry('META-INF/neoforge.mods.toml');
    if (toml) {
      const text = toml.getData().toString('utf-8');
      const modId = /modId\s*=\s*"([^"]+)"/.exec(text)?.[1];
      const name = /displayName\s*=\s*"([^"]+)"/.exec(text)?.[1];
      const version = /version\s*=\s*"([^"]+)"/.exec(text)?.[1];
      return { modId, name: name ?? modId, version };
    }
  } catch {
    /* not a readable jar */
  }
  return {};
}

export async function listMods(instanceId: string): Promise<LocalMod[]> {
  const dir = modsDir(instanceId);
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter(
    (f) => f.endsWith('.jar') || f.endsWith('.jar.disabled')
  );
  const meta = await getModsMeta(instanceId);
  const mods: LocalMod[] = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const st = await fs.stat(full);
    const enabled = !f.endsWith('.disabled');
    const info = parseJarInfo(full);
    const m = meta[f] ?? meta[f.replace(/\.disabled$/, '')];
    mods.push({
      fileName: f,
      displayName: info.name ?? m?.name ?? f.replace(/\.jar(\.disabled)?$/, ''),
      modId: info.modId,
      version: info.version,
      enabled,
      size: st.size,
      source: m?.source ?? 'manual',
      projectId: m?.projectId,
      versionId: m?.versionId
    });
  }
  // conflict detection: same modId enabled more than once
  const byId = new Map<string, LocalMod[]>();
  for (const m of mods) {
    if (m.enabled && m.modId) {
      const arr = byId.get(m.modId) ?? [];
      arr.push(m);
      byId.set(m.modId, arr);
    }
  }
  for (const arr of byId.values()) {
    if (arr.length > 1) {
      for (const m of arr) m.conflictsWith = arr.filter((o) => o !== m).map((o) => o.fileName);
    }
  }
  return mods.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function toggleMod(instanceId: string, fileName: string, enabled: boolean): Promise<void> {
  const dir = modsDir(instanceId);
  const from = path.join(dir, fileName);
  const to = enabled ? from.replace(/\.disabled$/, '') : `${from}.disabled`;
  if (from === to) return;
  await fs.rename(from, to);
  await renameModMeta(instanceId, fileName, path.basename(to));
}

export async function deleteMod(instanceId: string, fileName: string): Promise<void> {
  await fs.rm(path.join(modsDir(instanceId), fileName), { force: true });
  await removeModMeta(instanceId, fileName);
}

/** Check for updates on Modrinth/CurseForge for all tracked mods. */
export async function checkModUpdates(instanceId: string): Promise<ModUpdateInfo[]> {
  const inst = await getInstance(instanceId);
  const mods = await listMods(instanceId);
  const updates: ModUpdateInfo[] = [];
  for (const mod of mods) {
    if (!mod.projectId || !mod.versionId || !mod.source || mod.source === 'manual') continue;
    try {
      if (mod.source === 'modrinth') {
        const latest = mrPickBestVersion(await mrListVersions(mod.projectId, inst.mcVersion, inst.loader));
        if (latest && latest.id !== mod.versionId) {
          const file = latest.files.find((f) => f.primary) ?? latest.files[0];
          updates.push({
            fileName: mod.fileName,
            projectId: mod.projectId,
            currentVersionId: mod.versionId,
            newVersionId: latest.id,
            newVersionName: latest.name,
            newFileName: file?.filename ?? ''
          });
        }
      } else {
        const files = await cfGetFiles(mod.projectId, inst.mcVersion, inst.loader);
        const latest = files.sort((a, b) => b.fileDate.localeCompare(a.fileDate))[0];
        if (latest && String(latest.id) !== mod.versionId) {
          updates.push({
            fileName: mod.fileName,
            projectId: mod.projectId,
            currentVersionId: mod.versionId,
            newVersionId: String(latest.id),
            newVersionName: latest.displayName,
            newFileName: latest.fileName
          });
        }
      }
    } catch {
      /* skip mods we can't check */
    }
  }
  return updates;
}

/** Apply one update: remove old file, install the new version. */
export async function applyModUpdate(instanceId: string, update: ModUpdateInfo): Promise<void> {
  const inst = await getInstance(instanceId);
  const meta = (await getModsMeta(instanceId))[update.fileName];
  await deleteMod(instanceId, update.fileName);
  if (meta?.source === 'curseforge') {
    await cfInstall(instanceId, update.projectId, 'mod', inst.mcVersion, inst.loader, Number(update.newVersionId));
  } else {
    await mrInstall(instanceId, update.projectId, 'mod', inst.mcVersion, inst.loader, update.newVersionId);
  }
}
