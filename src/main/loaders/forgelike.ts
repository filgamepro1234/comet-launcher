import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { dirs, ensureDir, exists } from '../paths';
import { downloadFile, fetchJson } from '../http';
import { getVanillaVersionJson, versionJsonPath, versionJarPath } from '../minecraft/manifest';
import { ensureJavaRuntime, javaExeFromJavaw } from '../minecraft/java';
import { newTaskId, progressReporter } from '../tasks';
import type { LoaderVersionInfo } from '../../shared/types';

const FORGE_META = 'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const NEO_VERSIONS = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
const NEO_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';

export async function listForgeVersions(mcVersion: string): Promise<LoaderVersionInfo[]> {
  const [meta, promos] = await Promise.all([
    fetchJson<Record<string, string[]>>(FORGE_META),
    fetchJson<{ promos: Record<string, string> }>(FORGE_PROMOS).catch(() => ({ promos: {} as Record<string, string> }))
  ]);
  const all = meta[mcVersion] ?? [];
  const recommended = promos.promos?.[`${mcVersion}-recommended`];
  const latest = promos.promos?.[`${mcVersion}-latest`];
  return all
    .map((full) => {
      const v = full.startsWith(`${mcVersion}-`) ? full.slice(mcVersion.length + 1) : full;
      return { version: v, recommended: v === recommended, stable: v === recommended || v === latest };
    })
    .reverse();
}

/** NeoForge versions for MC 1.20.2+ follow "<minor>.<patch>.<build>" (e.g. 1.21.1 -> 21.1.x). */
export async function listNeoForgeVersions(mcVersion: string): Promise<LoaderVersionInfo[]> {
  const data = await fetchJson<{ versions: string[] }>(NEO_VERSIONS);
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(mcVersion);
  if (!m) return [];
  const prefix = `${m[1]}.${m[2] ?? '0'}.`;
  return data.versions
    .filter((v) => v.startsWith(prefix))
    .map((v) => ({ version: v, stable: !v.includes('beta') }))
    .reverse();
}

function installerUrl(kind: 'forge' | 'neoforge', mcVersion: string, loaderVersion: string) {
  if (kind === 'forge') {
    const full = `${mcVersion}-${loaderVersion}`;
    return { url: `${FORGE_MAVEN}/${full}/forge-${full}-installer.jar`, full };
  }
  return { url: `${NEO_MAVEN}/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`, full: loaderVersion };
}

/** Recursively copy src into dst without overwriting existing files. */
async function copyDirMerge(src: string, dst: string) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      await ensureDir(d);
      await copyDirMerge(s, d);
    } else if (!(await exists(d))) {
      await fs.copyFile(s, d);
    }
  }
}

/**
 * Run the official installer headlessly in an ISOLATED work dir (its profile
 * injection chokes on the real launcher_profiles.json written by the official
 * launcher, and we must never touch that file anyway), then merge the created
 * version + libraries into the shared .minecraft folders.
 */
export async function installForgeLike(
  kind: 'forge' | 'neoforge',
  mcVersion: string,
  loaderVersion: string
): Promise<string> {
  const taskId = newTaskId('loader');
  const rep = progressReporter(taskId, `A instalar ${kind === 'forge' ? 'Forge' : 'NeoForge'} ${loaderVersion}`);
  const work = path.join(dirs.cache(), `${kind}-install-${Date.now()}`);
  try {
    rep.report(0, 4, 'A preparar ambiente do installer...');
    const vanilla = await getVanillaVersionJson(mcVersion);
    // the installer patches the vanilla client jar, so make sure it exists
    if (vanilla.downloads?.client) {
      await downloadFile({
        url: vanilla.downloads.client.url,
        dest: versionJarPath(mcVersion),
        sha1: vanilla.downloads.client.sha1,
        size: vanilla.downloads.client.size
      });
    }
    const workVer = path.join(work, 'versions', mcVersion);
    await ensureDir(workVer);
    await ensureDir(path.join(work, 'libraries'));
    await fs.writeFile(
      path.join(work, 'launcher_profiles.json'),
      JSON.stringify({ profiles: {}, settings: {}, version: 3 })
    );
    await fs.copyFile(versionJsonPath(mcVersion), path.join(workVer, `${mcVersion}.json`));
    if (await exists(versionJarPath(mcVersion))) {
      await fs.copyFile(versionJarPath(mcVersion), path.join(workVer, `${mcVersion}.jar`));
    }

    const { url, full } = installerUrl(kind, mcVersion, loaderVersion);
    const installerJar = path.join(dirs.cache(), `${kind}-${full}-installer.jar`);
    rep.report(1, 4, 'A descarregar installer...');
    await downloadFile({ url, dest: installerJar });

    const component = vanilla.javaVersion?.component ?? 'jre-legacy';
    const javaw = await ensureJavaRuntime(component, taskId);
    const java = javaExeFromJavaw(javaw);

    rep.report(2, 4, 'A executar installer (pode demorar uns minutos)...');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(java, ['-jar', installerJar, '--installClient', work], { cwd: work });
      let output = '';
      child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Installer terminou com código ${code}:\n…${output.slice(-1500)}`));
      });
    });

    rep.report(3, 4, 'A copiar versão e bibliotecas...');
    const created = (await fs.readdir(path.join(work, 'versions'))).filter((d) => d !== mcVersion);
    const versionId =
      created.find((d) => d.toLowerCase().includes(kind === 'forge' ? 'forge' : 'neoforge')) ?? created[0];
    if (!versionId) throw new Error('O installer não criou nenhuma versão nova.');
    await ensureDir(path.join(dirs.versions(), versionId));
    await copyDirMerge(path.join(work, 'versions', versionId), path.join(dirs.versions(), versionId));
    if (await exists(path.join(work, 'libraries'))) {
      await copyDirMerge(path.join(work, 'libraries'), dirs.libraries());
    }
    rep.done();
    return versionId;
  } catch (e) {
    rep.fail(String(e));
    throw e;
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
