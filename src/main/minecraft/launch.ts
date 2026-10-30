import path from 'path';
import { promises as fs } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { dirs, gameDir, instanceDir, ensureDir, exists } from '../paths';
import { getSettings } from '../store';
import { broadcast, newTaskId } from '../tasks';
import { resolveVersionChain, versionJarPath } from './manifest';
import { ensureVersionInstalled, activeLibraries, libraryDiskPath, nativesDirFor } from './install';
import { ensureJavaRuntime } from './java';
import { rulesAllow, nativeClassifier, type FeatureFlags } from './rules';
import { mavenKey } from './maven';
import type { ArgValue, VersionJson } from './versionTypes';
import type { Account, InstanceConfig } from '../../shared/types';

const running = new Map<string, ChildProcess>();

/** Accumulate playtime directly on instance.json (avoids circular import with instances.ts). */
async function addPlaytime(instanceId: string, ms: number) {
  const file = path.join(instanceDir(instanceId), 'instance.json');
  try {
    const cfg = JSON.parse(await fs.readFile(file, 'utf-8'));
    cfg.totalPlayTimeMs = (cfg.totalPlayTimeMs ?? 0) + ms;
    await fs.writeFile(file, JSON.stringify(cfg, null, 2));
  } catch {
    /* instance removed meanwhile */
  }
}

export function runningInstances(): string[] {
  return [...running.keys()];
}

export function killInstance(id: string) {
  running.get(id)?.kill();
}

function substitute(arg: string, vars: Record<string, string>): string {
  return arg.replace(/\$\{([^}]+)\}/g, (_, key) => vars[key] ?? '');
}

function processArgs(args: ArgValue[] | undefined, vars: Record<string, string>, features: FeatureFlags): string[] {
  const out: string[] = [];
  for (const a of args ?? []) {
    if (typeof a === 'string') {
      out.push(substitute(a, vars));
    } else if (rulesAllow(a.rules, features)) {
      const vals = Array.isArray(a.value) ? a.value : [a.value];
      out.push(...vals.map((v) => substitute(v, vars)));
    }
  }
  return out;
}

function buildClasspath(merged: VersionJson, clientJar: string): string {
  const seen = new Set<string>();
  const cp: string[] = [];
  for (const lib of activeLibraries(merged)) {
    // skip natives-only entries (they have no artifact and a natives map)
    if (!lib.downloads?.artifact && lib.natives && !lib.url) continue;
    const key = mavenKey(lib.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const p = libraryDiskPath(lib);
    if (p) cp.push(p);
  }
  cp.push(clientJar);
  return cp.join(path.delimiter);
}

export interface LaunchDeps {
  instance: InstanceConfig;
  account: Account;
  versionId: string;
}

export async function launchInstance({ instance, account, versionId }: LaunchDeps): Promise<void> {
  if (running.has(instance.id)) throw new Error('Esta instância já está em execução.');
  const settings = await getSettings();
  const taskId = newTaskId('launch');

  const merged = await ensureVersionInstalled(versionId, taskId);
  const component = merged.javaVersion?.component ?? 'jre-legacy';
  const javaw = instance.javaPath && (await exists(instance.javaPath))
    ? instance.javaPath
    : await ensureJavaRuntime(component, taskId);

  const gdir = gameDir(instance.id);
  await ensureDir(gdir);
  const nativesDir = nativesDirFor(merged.id);
  await ensureDir(nativesDir);

  const assetsRoot = dirs.assets();
  const assetIndexId = merged.assetIndex?.id ?? merged.assets ?? 'legacy';
  const isVirtual = await exists(path.join(assetsRoot, 'virtual', assetIndexId));
  const effectiveAssetsRoot = isVirtual ? path.join(assetsRoot, 'virtual', assetIndexId) : assetsRoot;

  const mem = instance.memory ?? settings.defaultMemory;
  const features: FeatureFlags = {
    is_demo_user: false,
    has_custom_resolution: Boolean(instance.width && instance.height),
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false
  };

  // prefer the child-named jar copy (created for Forge/NeoForge ignoreList matching)
  const ownJar = versionJarPath(merged.id);
  const clientJar = (await exists(ownJar)) ? ownJar : versionJarPath(merged.jar ?? merged.id);
  const classpath = buildClasspath(merged, clientJar);
  const vars: Record<string, string> = {
    auth_player_name: account.username,
    version_name: merged.id,
    game_directory: gdir,
    assets_root: effectiveAssetsRoot,
    game_assets: effectiveAssetsRoot,
    assets_index_name: assetIndexId,
    auth_uuid: account.uuid.replace(/-/g, ''),
    auth_access_token: account.accessToken ?? 'offline',
    auth_session: account.accessToken ?? 'offline',
    clientid: '',
    auth_xuid: '',
    user_type: 'msa',
    user_properties: '{}',
    version_type: merged.type ?? 'release',
    natives_directory: nativesDir,
    launcher_name: 'CometLauncher',
    launcher_version: '0.1.0',
    classpath,
    classpath_separator: path.delimiter,
    library_directory: dirs.libraries(),
    resolution_width: String(instance.width ?? 854),
    resolution_height: String(instance.height ?? 480)
  };

  const jvmArgs: string[] = [`-Xms${mem.min}M`, `-Xmx${mem.max}M`];
  if (instance.jvmArgs) jvmArgs.push(...instance.jvmArgs.split(/\s+/).filter(Boolean));

  if (merged.arguments?.jvm?.length) {
    jvmArgs.push(...processArgs(merged.arguments.jvm, vars, features));
  } else {
    jvmArgs.push(`-Djava.library.path=${nativesDir}`, '-cp', classpath);
  }

  // log4j config (also mitigates log4shell on old versions)
  if (merged.logging?.client) {
    const logFile = path.join(dirs.assets(), 'log_configs', merged.logging.client.file.id);
    if (await exists(logFile)) {
      jvmArgs.push(substitute(merged.logging.client.argument, { path: logFile }));
    }
  }

  let gameArgs: string[];
  if (merged.arguments?.game?.length) {
    gameArgs = processArgs(merged.arguments.game, vars, features);
  } else {
    gameArgs = (merged.minecraftArguments ?? '').split(' ').filter(Boolean).map((a) => substitute(a, vars));
  }
  if (features.has_custom_resolution && !merged.arguments?.game?.length) {
    gameArgs.push('--width', vars.resolution_width, '--height', vars.resolution_height);
  }

  const mainClass = merged.mainClass;
  if (!mainClass) throw new Error('mainClass em falta no version json.');

  const child = spawn(javaw, [...jvmArgs, mainClass, ...gameArgs], {
    cwd: gdir,
    detached: false
  });
  running.set(instance.id, child);
  const startedAt = Date.now();
  broadcast('game:state', { instanceId: instance.id, running: true });
  broadcast('game:log', {
    instanceId: instance.id,
    stream: 'system',
    line: `[Comet] Java: ${javaw}\n[Comet] Versão: ${merged.id}\n[Comet] A iniciar...`
  });

  const forward = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
    for (const line of data.toString('utf-8').split(/\r?\n/)) {
      if (line.trim().length) broadcast('game:log', { instanceId: instance.id, stream, line });
    }
  };
  child.stdout?.on('data', forward('stdout'));
  child.stderr?.on('data', forward('stderr'));
  child.on('error', (e) => {
    broadcast('game:log', { instanceId: instance.id, stream: 'system', line: `[Comet] Erro: ${e.message}` });
    running.delete(instance.id);
    broadcast('game:state', { instanceId: instance.id, running: false, exitCode: null });
  });
  child.on('exit', (code) => {
    running.delete(instance.id);
    void addPlaytime(instance.id, Date.now() - startedAt);
    broadcast('game:log', { instanceId: instance.id, stream: 'system', line: `[Comet] Processo terminou (código ${code}).` });
    broadcast('game:state', { instanceId: instance.id, running: false, exitCode: code });
  });
}

export async function readLatestLog(instanceId: string): Promise<string> {
  const file = path.join(gameDir(instanceId), 'logs', 'latest.log');
  try {
    const data = await fs.readFile(file, 'utf-8');
    return data.length > 400_000 ? data.slice(-400_000) : data;
  } catch {
    return '';
  }
}
