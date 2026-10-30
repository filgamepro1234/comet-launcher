import path from 'path';
import { promises as fs } from 'fs';
import { cometRoot, ensureDir } from './paths';
import type { Settings, Account } from '../shared/types';

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, file).catch(async () => {
    // Windows rename over existing file can fail transiently; fall back to copy
    await fs.copyFile(tmp, file);
    await fs.unlink(tmp).catch(() => {});
  });
}

const settingsFile = () => path.join(cometRoot(), 'settings.json');
const accountsFile = () => path.join(cometRoot(), 'accounts.json');

export const defaultSettings: Settings = {
  defaultMemory: { min: 1024, max: 4096 },
  concurrentDownloads: 8
};

export async function getSettings(): Promise<Settings> {
  return { ...defaultSettings, ...(await readJson<Partial<Settings>>(settingsFile(), {})) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await getSettings()), ...patch };
  await writeJson(settingsFile(), merged);
  return merged;
}

export async function getAccounts(): Promise<Account[]> {
  return readJson<Account[]>(accountsFile(), []);
}

export async function saveAccounts(accounts: Account[]) {
  await writeJson(accountsFile(), accounts);
}

export { readJson, writeJson };
