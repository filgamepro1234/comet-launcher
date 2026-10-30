import { useEffect, useState } from 'react';
import { api } from '../api';
import type { LoaderKind, LoaderVersionInfo, McVersionInfo } from '../../../shared/types';

export function NewInstanceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [versions, setVersions] = useState<McVersionInfo[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [mcVersion, setMcVersion] = useState('');
  const [loader, setLoader] = useState<LoaderKind>('vanilla');
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionInfo[]>([]);
  const [loaderVersion, setLoaderVersion] = useState('');
  const [loadingLoaders, setLoadingLoaders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.versions
      .mc(showSnapshots)
      .then((v) => {
        setVersions(v);
        if (!mcVersion && v.length) setMcVersion(v[0].id);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSnapshots]);

  useEffect(() => {
    setLoaderVersions([]);
    setLoaderVersion('');
    if (loader === 'vanilla' || !mcVersion) return;
    setLoadingLoaders(true);
    setError(null);
    api.versions
      .loader(loader, mcVersion)
      .then((list) => {
        setLoaderVersions(list);
        const rec = list.find((l) => l.recommended) ?? list.find((l) => l.stable) ?? list[0];
        if (rec) setLoaderVersion(rec.version);
        if (!list.length) setError(`Não há versões de ${loader} para Minecraft ${mcVersion}.`);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingLoaders(false));
  }, [loader, mcVersion]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await api.instances.create({
        name: name.trim() || `Minecraft ${mcVersion}`,
        mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? undefined : loaderVersion || undefined
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nova instância</h3>
        <label className="field">
          <span>Nome</span>
          <input type="text" value={name} placeholder={`Minecraft ${mcVersion}`} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Versão do Minecraft</span>
          <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} {v.type !== 'release' ? `(${v.type})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={showSnapshots}
            onChange={(e) => setShowSnapshots(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span style={{ margin: 0 }}>Mostrar snapshots</span>
        </label>
        <label className="field">
          <span>Mod loader</span>
          <select value={loader} onChange={(e) => setLoader(e.target.value as LoaderKind)}>
            <option value="vanilla">Vanilla (sem mods)</option>
            <option value="fabric">Fabric</option>
            <option value="quilt">Quilt</option>
            <option value="forge">Forge</option>
            <option value="neoforge">NeoForge</option>
          </select>
        </label>
        {loader !== 'vanilla' && (
          <label className="field">
            <span>Versão do loader {loadingLoaders ? '(a carregar…)' : ''}</span>
            <select value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
              {loaderVersions.map((l) => (
                <option key={l.version} value={l.version}>
                  {l.version}
                  {l.recommended ? ' (recomendada)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={creating || !mcVersion || (loader !== 'vanilla' && !loaderVersion)} onClick={() => void create()}>
            {creating ? 'A criar…' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}
