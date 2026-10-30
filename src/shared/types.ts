export type LoaderKind = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';

export interface InstanceConfig {
  id: string;
  name: string;
  mcVersion: string;
  loader: LoaderKind;
  /** Loader version, e.g. "0.15.11" (fabric) or "47.2.0" (forge) */
  loaderVersion?: string;
  /** Actual version json id created by a forge/neoforge installer (detected after install) */
  installedVersionId?: string;
  createdAt: number;
  lastPlayed?: number;
  /** Grouping in the main grid (Prism-style); undefined = ungrouped */
  group?: string;
  totalPlayTimeMs?: number;
  memory?: { min: number; max: number };
  jvmArgs?: string;
  javaPath?: string;
  width?: number;
  height?: number;
  notes?: string;
}

export interface Account {
  id: string;
  type: 'microsoft' | 'offline';
  username: string;
  uuid: string;
  accessToken?: string;
  refreshToken?: string;
  /** epoch ms when the MC access token expires */
  expiresAt?: number;
}

export interface Settings {
  curseforgeApiKey?: string;
  msClientId?: string;
  defaultMemory: { min: number; max: number };
  javaPath?: string;
  concurrentDownloads: number;
  activeAccountId?: string;
  showSnapshots?: boolean;
}

export interface McVersionInfo {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  releaseTime: string;
}

export interface TaskProgress {
  taskId: string;
  label: string;
  current: number;
  total: number;
  detail?: string;
  done?: boolean;
  error?: string;
}

export interface LocalMod {
  fileName: string;
  displayName: string;
  modId?: string;
  version?: string;
  enabled: boolean;
  size: number;
  source?: 'modrinth' | 'curseforge' | 'manual';
  projectId?: string;
  versionId?: string;
  conflictsWith?: string[];
}

export interface ModUpdateInfo {
  fileName: string;
  projectId: string;
  currentVersionId: string;
  newVersionId: string;
  newVersionName: string;
  newFileName: string;
}

export interface ContentSearchHit {
  source: 'modrinth' | 'curseforge';
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl?: string;
  type: ContentType;
  follows?: number;
  updated?: string;
  categories?: string[];
}

export type ContentSort = 'relevance' | 'downloads' | 'newest' | 'updated';

export type ContentType = 'mod' | 'resourcepack' | 'modpack';

export interface ContentSearchQuery {
  source: 'modrinth' | 'curseforge';
  type: ContentType;
  query: string;
  mcVersion?: string;
  loader?: LoaderKind;
  page: number;
  pageSize?: number;
  sort?: ContentSort;
  categories?: string[];
}

export interface ContentSearchResult {
  hits: ContentSearchHit[];
  total: number;
}

export interface ScreenshotInfo {
  name: string;
  url: string;
  mtime: number;
  size: number;
}

export interface ResourcePackInfo {
  fileName: string;
  size: number;
  description?: string;
}

export interface DeviceCodeInfo {
  userCode: string;
  verificationUri: string;
  message: string;
}

export interface GameLogEvent {
  instanceId: string;
  line: string;
  stream: 'stdout' | 'stderr' | 'system';
}

export interface GameStateEvent {
  instanceId: string;
  running: boolean;
  exitCode?: number | null;
}

export interface LoaderVersionInfo {
  version: string;
  stable?: boolean;
  recommended?: boolean;
}
