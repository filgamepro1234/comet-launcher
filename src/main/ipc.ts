import { ipcMain, dialog, app } from 'electron';
import * as instances from './instances';
import * as mods from './content/mods';
import * as rp from './content/resourcepacks';
import * as shots from './screenshots';
import * as modpacks from './content/modpacks';
import { mrSearch, mrInstall } from './content/modrinth';
import { cfSearch, cfInstall } from './content/curseforge';
import { listMcVersions } from './minecraft/manifest';
import { readLatestLog } from './minecraft/launch';
import { listFabricLikeVersions } from './loaders/fabriclike';
import { listForgeVersions, listNeoForgeVersions } from './loaders/forgelike';
import { getSettings, saveSettings } from './store';
import * as accounts from './auth/accounts';
import type { ContentSearchQuery, InstanceConfig, LoaderKind, ModUpdateInfo, Settings } from '../shared/types';

function handle(channel: string, fn: (...args: never[]) => unknown) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await (fn as (...a: unknown[]) => unknown)(...args) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export function registerIpc() {
  // instances
  handle('instances:list', () => instances.listInstances());
  handle('instances:get', (id: string) => instances.getInstance(id));
  handle('instances:create', (opts: instances.CreateInstanceOpts) => instances.createInstance(opts));
  handle('instances:update', (id: string, patch: Partial<InstanceConfig>) => instances.updateInstance(id, patch));
  handle('instances:duplicate', (id: string) => instances.duplicateInstance(id));
  handle('instances:delete', (id: string) => instances.deleteInstance(id));
  handle('instances:openFolder', (id: string) => instances.openInstanceFolder(id));
  handle('instances:launch', (id: string) => instances.launch(id));
  handle('instances:kill', (id: string) => instances.killInstance(id));
  handle('instances:running', () => instances.runningInstances());
  handle('instances:prepare', (id: string) => instances.prepareInstance(id));
  handle('instances:export', (id: string) => instances.exportInstance(id));
  handle('instances:shortcut', (id: string) => instances.createShortcut(id));
  handle('instances:openRoot', () => instances.openInstancesRoot());

  // versions
  handle('mc:versions', (includeSnapshots: boolean) => listMcVersions(includeSnapshots));
  handle('loader:versions', (loader: LoaderKind, mcVersion: string) => {
    switch (loader) {
      case 'fabric':
      case 'quilt':
        return listFabricLikeVersions(loader, mcVersion);
      case 'forge':
        return listForgeVersions(mcVersion);
      case 'neoforge':
        return listNeoForgeVersions(mcVersion);
      default:
        return [];
    }
  });

  // accounts
  handle('accounts:list', () => accounts.listAccounts());
  handle('accounts:addOffline', (name: string) => accounts.addOfflineAccount(name));
  handle('accounts:addMicrosoft', () => accounts.addMicrosoftAccount());
  handle('accounts:remove', (id: string) => accounts.removeAccount(id));
  handle('accounts:setActive', (id: string) => accounts.setActiveAccount(id));

  // settings
  handle('settings:get', () => getSettings());
  handle('settings:set', (patch: Partial<Settings>) => saveSettings(patch));

  // mods
  handle('mods:list', (instanceId: string) => mods.listMods(instanceId));
  handle('mods:toggle', (instanceId: string, fileName: string, enabled: boolean) =>
    mods.toggleMod(instanceId, fileName, enabled)
  );
  handle('mods:delete', (instanceId: string, fileName: string) => mods.deleteMod(instanceId, fileName));
  handle('mods:checkUpdates', (instanceId: string) => mods.checkModUpdates(instanceId));
  handle('mods:applyUpdate', (instanceId: string, update: ModUpdateInfo) => mods.applyModUpdate(instanceId, update));

  // content search/install
  handle('content:search', (q: ContentSearchQuery) => (q.source === 'modrinth' ? mrSearch(q) : cfSearch(q)));
  handle(
    'content:install',
    async (source: 'modrinth' | 'curseforge', type: 'mod' | 'resourcepack', projectId: string, instanceId: string) => {
      const inst = await instances.getInstance(instanceId);
      return source === 'modrinth'
        ? mrInstall(instanceId, projectId, type, inst.mcVersion, inst.loader)
        : cfInstall(instanceId, projectId, type, inst.mcVersion, inst.loader);
    }
  );
  handle('modpack:install', (source: 'modrinth' | 'curseforge', projectId: string) =>
    source === 'modrinth' ? modpacks.installMrModpack(projectId) : modpacks.installCfModpack(projectId)
  );
  handle('modpack:importFile', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Importar modpack',
      filters: [{ name: 'Modpacks', extensions: ['mrpack', 'zip'] }],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return modpacks.importModpackFile(res.filePaths[0]);
  });

  // resource packs
  handle('rp:list', (instanceId: string) => rp.listResourcePacks(instanceId));
  handle('rp:delete', (instanceId: string, fileName: string) => rp.deleteResourcePack(instanceId, fileName));

  // screenshots
  handle('shots:list', (instanceId: string) => shots.listScreenshots(instanceId));
  handle('shots:delete', (instanceId: string, name: string) => shots.deleteScreenshot(instanceId, name));
  handle('shots:openFolder', (instanceId: string) => shots.openScreenshotsFolder(instanceId));

  // logs
  handle('logs:latest', (instanceId: string) => readLatestLog(instanceId));

  handle('app:version', () => app.getVersion());
}
