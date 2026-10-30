import type { InstanceConfig } from '../../../shared/types';

export function formatPlaytime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function StatusBar({ instances, selected }: { instances: InstanceConfig[]; selected: InstanceConfig | null }) {
  const total = instances.reduce((acc, i) => acc + (i.totalPlayTimeMs ?? 0), 0);
  return (
    <div className="statusbar">
      <span>
        {selected
          ? `Minecraft ${selected.mcVersion}${selected.loader !== 'vanilla' ? ` · ${selected.loader}` : ''}`
          : 'Comet Launcher'}
      </span>
      {selected?.totalPlayTimeMs ? <span>Tempo nesta instância: {formatPlaytime(selected.totalPlayTimeMs)}</span> : null}
      <span className="sb-spacer" />
      <span>Tempo de jogo total: {formatPlaytime(total)}</span>
    </div>
  );
}
