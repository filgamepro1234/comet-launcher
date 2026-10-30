import { createHash, randomUUID } from 'crypto';
import { getAccounts, saveAccounts, getSettings, saveSettings } from '../store';
import { loginWithDeviceCode, refreshAccount } from './microsoft';
import type { Account } from '../../shared/types';

/** Same UUID scheme vanilla uses for offline mode: UUIDv3-ish of "OfflinePlayer:<name>". */
export function offlineUuid(name: string): string {
  const md5 = createHash('md5').update(`OfflinePlayer:${name}`, 'utf-8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30; // version 3
  md5[8] = (md5[8] & 0x3f) | 0x80; // variant
  const hex = md5.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function listAccounts(): Promise<{ accounts: Account[]; activeId?: string }> {
  const [accounts, settings] = await Promise.all([getAccounts(), getSettings()]);
  return { accounts: accounts.map(redact), activeId: settings.activeAccountId };
}

function redact(a: Account): Account {
  return { ...a, accessToken: undefined, refreshToken: undefined };
}

export async function addOfflineAccount(name: string): Promise<Account> {
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) {
    throw new Error('Nome inválido: usa 3–16 caracteres (letras, números, _).');
  }
  const accounts = await getAccounts();
  const acc: Account = {
    id: `offline-${randomUUID()}`,
    type: 'offline',
    username: trimmed,
    uuid: offlineUuid(trimmed)
  };
  accounts.push(acc);
  await saveAccounts(accounts);
  const settings = await getSettings();
  if (!settings.activeAccountId) await saveSettings({ activeAccountId: acc.id });
  return redact(acc);
}

export async function addMicrosoftAccount(): Promise<Account> {
  const acc = await loginWithDeviceCode();
  const accounts = await getAccounts();
  const idx = accounts.findIndex((a) => a.id === acc.id);
  if (idx >= 0) accounts[idx] = acc;
  else accounts.push(acc);
  await saveAccounts(accounts);
  await saveSettings({ activeAccountId: acc.id });
  return redact(acc);
}

export async function removeAccount(id: string) {
  const accounts = (await getAccounts()).filter((a) => a.id !== id);
  await saveAccounts(accounts);
  const settings = await getSettings();
  if (settings.activeAccountId === id) {
    await saveSettings({ activeAccountId: accounts[0]?.id });
  }
}

export async function setActiveAccount(id: string) {
  await saveSettings({ activeAccountId: id });
}

/** Resolve the active account with a fresh token (refreshing if needed). */
export async function getLaunchAccount(): Promise<Account> {
  const accounts = await getAccounts();
  const settings = await getSettings();
  let acc = accounts.find((a) => a.id === settings.activeAccountId) ?? accounts[0];
  if (!acc) throw new Error('Nenhuma conta configurada. Adiciona uma conta primeiro.');
  if (acc.type === 'microsoft') {
    const needsRefresh = !acc.accessToken || !acc.expiresAt || acc.expiresAt < Date.now() + 5 * 60_000;
    if (needsRefresh) {
      acc = await refreshAccount(acc);
      const idx = accounts.findIndex((a) => a.id === acc!.id);
      accounts[idx] = acc;
      await saveAccounts(accounts);
    }
  }
  return acc;
}
