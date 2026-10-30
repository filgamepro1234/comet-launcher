import path from 'path';
import { promises as fs } from 'fs';
import AdmZip from 'adm-zip';
import { gameDir } from '../paths';
import type { ResourcePackInfo } from '../../shared/types';

const rpDir = (instanceId: string) => path.join(gameDir(instanceId), 'resourcepacks');

export async function listResourcePacks(instanceId: string): Promise<ResourcePackInfo[]> {
  const dir = rpDir(instanceId);
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.zip'));
  const out: ResourcePackInfo[] = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const st = await fs.stat(full);
    let description: string | undefined;
    try {
      const zip = new AdmZip(full);
      const mcmeta = zip.getEntry('pack.mcmeta');
      if (mcmeta) {
        const j = JSON.parse(mcmeta.getData().toString('utf-8'));
        const d = j.pack?.description;
        description = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: { text?: string }) => x.text ?? '').join('') : d?.text;
      }
    } catch {
      /* unreadable */
    }
    out.push({ fileName: f, size: st.size, description });
  }
  return out.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export async function deleteResourcePack(instanceId: string, fileName: string) {
  await fs.rm(path.join(rpDir(instanceId), fileName), { force: true });
}
