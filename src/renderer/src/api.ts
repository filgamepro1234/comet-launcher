import type {
  Account,
  ContentSearchQuery,
  ContentSearchResult,
  InstanceConfig,
  LoaderKind,
  LoaderVersionInfo,
  LocalMod,
  McVersionInfo,
  ModUpdateInfo,
  ResourcePackInfo,
  ScreenshotInfo,
  Settings
} from '../../shared/types';

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = await window.comet.invoke<T>(channel, ...args);
  if (!res.ok) throw new Error(res.error ?? 'Erro desconhecido');
  return res.data as T;
}

export const api = {
  instances: {
    list: () => call<InstanceConfig[]>('instances:list'),
    get: (id: string) => call<InstanceConfig>('instances:get', id),
    create: (opts: { name: string; mcVersion: string; loader: LoaderKind; loaderVersion?: string }) =>
      call<InstanceConfig>('instances:create', opts),
    update: (id: string, patch: Partial<InstanceConfig>) => call<InstanceConfig>('instances:update', id, patch),
    duplicate: (id: string) => call<InstanceConfig>('instances:duplicate', id),
    remove: (id: string) => call<void>('instances:delete', id),
    openFolder: (id: string) => call<void>('instances:openFolder', id),
    launch: (id: string) => call<void>('instances:launch', id),
    kill: (id: string) => call<void>('instances:kill', id),
    running: () => call<string[]>('instances:running'),
    export: (id: string) => call<string | null>('instances:export', id),
    shortcut: (id: string) => call<string>('instances:shortcut', id),
    openRoot: () => call<void>('instances:openRoot')
  },
  versions: {
    mc: (includeSnapshots: boolean) => call<McVersionInfo[]>('mc:versions', includeSnapshots),
    loader: (loader: LoaderKind, mcVersion: string) => call<LoaderVersionInfo[]>('loader:versions', loader, mcVersion)
  },
  accounts: {
    list: () => call<{ accounts: Account[]; activeId?: string }>('accounts:list'),
    addOffline: (name: string) => call<Account>('accounts:addOffline', name),
    addMicrosoft: () => call<Account>('accounts:addMicrosoft'),
    remove: (id: string) => call<void>('accounts:remove', id),
    setActive: (id: string) => call<void>('accounts:setActive', id)
  },
  settings: {
    get: () => call<Settings>('settings:get'),
    set: (patch: Partial<Settings>) => call<Settings>('settings:set', patch)
  },
  mods: {
    list: (instanceId: string) => call<LocalMod[]>('mods:list', instanceId),
    toggle: (instanceId: string, fileName: string, enabled: boolean) =>
      call<void>('mods:toggle', instanceId, fileName, enabled),
    remove: (instanceId: string, fileName: string) => call<void>('mods:delete', instanceId, fileName),
    checkUpdates: (instanceId: string) => call<ModUpdateInfo[]>('mods:checkUpdates', instanceId),
    applyUpdate: (instanceId: string, update: ModUpdateInfo) => call<void>('mods:applyUpdate', instanceId, update)
  },
  content: {
    search: (q: ContentSearchQuery) => call<ContentSearchResult>('content:search', q),
    install: (source: 'modrinth' | 'curseforge', type: 'mod' | 'resourcepack', projectId: string, instanceId: string) =>
      call<string[]>('content:install', source, type, projectId, instanceId),
    installModpack: (source: 'modrinth' | 'curseforge', projectId: string) =>
      call<InstanceConfig>('modpack:install', source, projectId),
    importModpackFile: () => call<InstanceConfig | null>('modpack:importFile')
  },
  rp: {
    list: (instanceId: string) => call<ResourcePackInfo[]>('rp:list', instanceId),
    remove: (instanceId: string, fileName: string) => call<void>('rp:delete', instanceId, fileName)
  },
  shots: {
    list: (instanceId: string) => call<ScreenshotInfo[]>('shots:list', instanceId),
    remove: (instanceId: string, name: string) => call<void>('shots:delete', instanceId, name),
    openFolder: (instanceId: string) => call<void>('shots:openFolder', instanceId)
  },
  logs: {
    latest: (instanceId: string) => call<string>('logs:latest', instanceId)
  }
};

export function onEvent<T>(channel: string, cb: (payload: T) => void): () => void {
  return window.comet.on(channel, cb as (p: unknown) => void);
}
