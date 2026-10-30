import { app } from 'electron';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Shared Minecraft root, same location and layout as the official launcher, so
 * assets/libraries/versions already downloaded are reused:
 * Windows %APPDATA%\.minecraft, Linux ~/.minecraft, macOS ~/Library/Application Support/minecraft.
 */
export const dataRoot = () => {
  if (process.platform === 'win32') return path.join(app.getPath('appData'), '.minecraft');
  if (process.platform === 'darwin') return path.join(app.getPath('appData'), 'minecraft');
  return path.join(app.getPath('home'), '.minecraft');
};

/** Launcher-private data lives inside .minecraft\comet */
export const cometRoot = () => path.join(dataRoot(), 'comet');

export const dirs = {
  versions: () => path.join(dataRoot(), 'versions'),
  libraries: () => path.join(dataRoot(), 'libraries'),
  assets: () => path.join(dataRoot(), 'assets'),
  meta: () => path.join(cometRoot(), 'meta'),
  java: () => path.join(cometRoot(), 'java'),
  instances: () => path.join(cometRoot(), 'instances'),
  cache: () => path.join(cometRoot(), 'cache')
};

export function instanceDir(id: string) {
  return path.join(dirs.instances(), id);
}
export function gameDir(id: string) {
  return path.join(instanceDir(id), '.minecraft');
}

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
  return p;
}

export async function ensureBaseDirs() {
  for (const d of Object.values(dirs)) await ensureDir(d());
}

export async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
