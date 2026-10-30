import path from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { app, dialog, shell } from 'electron';
import AdmZip from 'adm-zip';
import { dirs, instanceDir, gameDir, ensureDir, exists } from './paths';
import { readJson, writeJson, getSettings } from './store';
import { newTaskId, progressReporter } from './tasks';
import { ensureVersionInstalled } from './minecraft/install';
import { launchInstance, runningInstances, killInstance } from './minecraft/launch';
import { installFabricLike, listFabricLikeVersions, fabricLikeVersionId } from './loaders/fabriclike';
import { installForgeLike, listForgeVersions, listNeoForgeVersions } from './loaders/forgelike';
import { getLaunchAccount } from './auth/accounts';
import type { InstanceConfig, LoaderKind, LoaderVersionInfo } from '../shared/types';

const instFile = (id: string) => path.join(instanceDir(id), 'instance.json');

export async function listInstances(): Promise<InstanceConfig[]> {
  const root = dirs.instances();
  const entries = await fs.readdir(root).catch(() => [] as string[]);
  const out: InstanceConfig[] = [];
  for (const dir of entries) {
    const cfg = await readJson<InstanceConfig | null>(instFile(dir), null);
    if (cfg) out.push(cfg);
  }
  return out.sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt));
}

export async function getInstance(id: string): Promise<InstanceConfig> {
  const cfg = await readJson<InstanceConfig | null>(instFile(id), null);
  if (!cfg) throw new Error(`Instância não encontrada: ${id}`);
  return cfg;
}

export async function updateInstance(id: string, patch: Partial<InstanceConfig>): Promise<InstanceConfig> {
  const cfg = await getInstance(id);
  const merged = { ...cfg, ...patch, id: cfg.id };
  await writeJson(instFile(id), merged);
  return merged;
}

export interface CreateInstanceOpts {
  name: string;
  mcVersion: string;
  loader: LoaderKind;
  loaderVersion?: string;
}

export async function createInstance(opts: CreateInstanceOpts): Promise<InstanceConfig> {
  const id = `${opts.name.replace(/[^A-Za-z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'instancia'}-${randomUUID().slice(0, 6)}`;
  const cfg: InstanceConfig = {
    id,
    name: opts.name.trim() || 'Nova instância',
    mcVersion: opts.mcVersion,
    loader: opts.loader,
    loaderVersion: opts.loaderVersion,
    createdAt: Date.now()
  };
  await ensureDir(gameDir(id));
  for (const sub of ['mods', 'config', 'saves', 'resourcepacks', 'screenshots', 'shaderpacks']) {
    await ensureDir(path.join(gameDir(id), sub));
  }
  await writeJson(instFile(id), cfg);
  // fire-and-forget install so the UI stays responsive; progress via task events
  void prepareInstance(id).catch(() => {});
  return cfg;
}

/** Ensure loader + vanilla files are installed; returns effective version id. */
export async function prepareInstance(id: string): Promise<string> {
  const cfg = await getInstance(id);
  let versionId = cfg.mcVersion;

  if (cfg.loader === 'fabric' || cfg.loader === 'quilt') {
    let lv = cfg.loaderVersion;
    if (!lv) {
      const list = await listFabricLikeVersions(cfg.loader, cfg.mcVersion);
      lv = (list.find((l) => l.stable) ?? list[0])?.version;
      if (!lv) throw new Error(`Sem versões de ${cfg.loader} para MC ${cfg.mcVersion}`);
      await updateInstance(id, { loaderVersion: lv });
    }
    versionId = fabricLikeVersionId(cfg.loader, lv, cfg.mcVersion);
    if (!(await exists(path.join(dirs.versions(), versionId, `${versionId}.json`)))) {
      versionId = await installFabricLike(cfg.loader, cfg.mcVersion, lv);
    }
    await updateInstance(id, { installedVersionId: versionId });
  } else if (cfg.loader === 'forge' || cfg.loader === 'neoforge') {
    if (cfg.installedVersionId && (await exists(path.join(dirs.versions(), cfg.installedVersionId, `${cfg.installedVersionId}.json`)))) {
      versionId = cfg.installedVersionId;
    } else {
      let lv = cfg.loaderVersion;
      if (!lv) {
        const list = cfg.loader === 'forge' ? await listForgeVersions(cfg.mcVersion) : await listNeoForgeVersions(cfg.mcVersion);
        lv = (list.find((l) => l.recommended) ?? list.find((l) => l.stable) ?? list[0])?.version;
        if (!lv) throw new Error(`Sem versões de ${cfg.loader} para MC ${cfg.mcVersion}`);
        await updateInstance(id, { loaderVersion: lv });
      }
      versionId = await installForgeLike(cfg.loader, cfg.mcVersion, lv);
      await updateInstance(id, { installedVersionId: versionId });
    }
  }

  const taskId = newTaskId('install');
  await ensureVersionInstalled(versionId, taskId);
  return versionId;
}

export async function launch(id: string): Promise<void> {
  const account = await getLaunchAccount();
  const versionId = await prepareInstance(id);
  const cfg = await getInstance(id);
  await updateInstance(id, { lastPlayed: Date.now() });
  await launchInstance({ instance: cfg, account, versionId });
}

export { runningInstances, killInstance };

export async function duplicateInstance(id: string): Promise<InstanceConfig> {
  const src = await getInstance(id);
  const newId = `${src.id.replace(/-[0-9a-f]{6}$/, '')}-${randomUUID().slice(0, 6)}`;
  const taskId = newTaskId('copy');
  const rep = progressReporter(taskId, `A duplicar "${src.name}"`);
  rep.report(0, 1);
  await fs.cp(instanceDir(id), instanceDir(newId), { recursive: true });
  const cfg: InstanceConfig = { ...src, id: newId, name: `${src.name} (cópia)`, createdAt: Date.now(), lastPlayed: undefined };
  await writeJson(instFile(newId), cfg);
  rep.done();
  return cfg;
}

export async function deleteInstance(id: string): Promise<void> {
  if (runningInstances().includes(id)) throw new Error('Fecha o jogo antes de apagar a instância.');
  await fs.rm(instanceDir(id), { recursive: true, force: true });
}

export async function openInstanceFolder(id: string) {
  await shell.openPath(gameDir(id));
}

export async function openInstancesRoot() {
  await ensureDir(dirs.instances());
  await shell.openPath(dirs.instances());
}

/** Export the whole instance folder as a zip chosen by the user. */
export async function exportInstance(id: string): Promise<string | null> {
  const cfg = await getInstance(id);
  const res = await dialog.showSaveDialog({
    title: 'Exportar instância',
    defaultPath: `${cfg.name.replace(/[\\/:*?"<>|]/g, '_')}.zip`,
    filters: [{ name: 'Zip', extensions: ['zip'] }]
  });
  if (res.canceled || !res.filePath) return null;
  const taskId = newTaskId('export');
  const rep = progressReporter(taskId, `A exportar "${cfg.name}"`);
  rep.report(0, 1);
  const zip = new AdmZip();
  zip.addLocalFolder(instanceDir(id), cfg.name);
  await zip.writeZipPromise(res.filePath);
  rep.done();
  return res.filePath;
}

/** Create a desktop shortcut that launches this instance directly. */
export async function createShortcut(id: string): Promise<string> {
  const cfg = await getInstance(id);
  const safeName = cfg.name.replace(/[\\/:*?"<>|]/g, '_');
  const args = app.isPackaged ? `--launch=${id}` : `"${app.getAppPath()}" --launch=${id}`;

  if (process.platform === 'win32') {
    const lnk = path.join(app.getPath('desktop'), `${safeName}.lnk`);
    const ok = shell.writeShortcutLink(lnk, 'create', {
      target: process.execPath,
      args,
      cwd: path.dirname(process.execPath),
      description: `Lançar ${cfg.name} (Comet Launcher)`
    });
    if (!ok) throw new Error('Não foi possível criar o atalho.');
    return lnk;
  }

  // Linux: freedesktop .desktop entry (menu + desktop). An AppImage's execPath
  // lives in a temporary mount, so point at the AppImage file itself.
  const exec = process.env.APPIMAGE ?? process.execPath;
  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${cfg.name}`,
    `Comment=Lançar ${cfg.name} (Comet Launcher)`,
    `Exec="${exec}" ${args}`,
    'Terminal=false',
    'Categories=Game;',
    ''
  ].join('\n');
  const appsDir = path.join(app.getPath('home'), '.local', 'share', 'applications');
  await ensureDir(appsDir);
  const menuFile = path.join(appsDir, `comet-${id}.desktop`);
  await fs.writeFile(menuFile, entry, { mode: 0o755 });
  const desktopDir = app.getPath('desktop');
  if (await exists(desktopDir)) {
    const desktopFile = path.join(desktopDir, `${safeName}.desktop`);
    await fs.writeFile(desktopFile, entry, { mode: 0o755 });
    return desktopFile;
  }
  return menuFile;
}
