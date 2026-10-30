import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Settings } from '../../../shared/types';

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.settings.get().then(setSettings).catch((e) => setError(String(e)));
  }, []);

  if (!settings) return <div className="empty">A carregar…</div>;

  const save = async () => {
    setError(null);
    try {
      await api.settings.set(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const set = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  return (
    <>
      <div className="page-title">Definições</div>

      <div className="section">
        <h4>Memória predefinida (novas instâncias)</h4>
        <div className="row">
          <label className="field">
            <span>RAM mínima (MB)</span>
            <input
              type="number"
              min={256}
              step={256}
              value={settings.defaultMemory.min}
              onChange={(e) => set({ defaultMemory: { ...settings.defaultMemory, min: Number(e.target.value) } })}
            />
          </label>
          <label className="field">
            <span>RAM máxima (MB)</span>
            <input
              type="number"
              min={512}
              step={256}
              value={settings.defaultMemory.max}
              onChange={(e) => set({ defaultMemory: { ...settings.defaultMemory, max: Number(e.target.value) } })}
            />
          </label>
        </div>
        <label className="field">
          <span>Downloads em simultâneo</span>
          <input
            type="number"
            min={1}
            max={32}
            value={settings.concurrentDownloads}
            onChange={(e) => set({ concurrentDownloads: Math.max(1, Math.min(32, Number(e.target.value))) })}
          />
        </label>
        <label className="field">
          <span>Java global personalizado (vazio = download automático da Mojang)</span>
          <input
            type="text"
            value={settings.javaPath ?? ''}
            placeholder="C:\\Program Files\\Java\\...\\javaw.exe  ou  /usr/lib/jvm/.../bin/java"
            onChange={(e) => set({ javaPath: e.target.value || undefined })}
          />
        </label>
      </div>

      <div className="section">
        <h4>CurseForge</h4>
        <label className="field">
          <span>API key (obtém em console.curseforge.com — necessária para pesquisar/instalar do CurseForge)</span>
          <input
            type="password"
            value={settings.curseforgeApiKey ?? ''}
            placeholder="$2a$10$..."
            onChange={(e) => set({ curseforgeApiKey: e.target.value || undefined })}
          />
        </label>
      </div>

      <div className="section">
        <h4>Login Microsoft</h4>
        <label className="field">
          <span>Azure Client ID (regista uma app em portal.azure.com com «Allow public client flows»)</span>
          <input
            type="text"
            value={settings.msClientId ?? ''}
            placeholder="00000000-0000-0000-0000-000000000000"
            onChange={(e) => set({ msClientId: e.target.value || undefined })}
          />
        </label>
        <div className="hint">
          Sem Client ID próprio o login Microsoft não funciona — o device code flow precisa de uma app Azure registada.
          Cria uma app gratuita: portal.azure.com → App registrations → New registration → tipo «Personal Microsoft
          accounts» → Authentication → ativa «Allow public client flows».
        </div>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <button className="btn primary" onClick={() => void save()}>
        {saved ? 'Guardado' : 'Guardar definições'}
      </button>
    </>
  );
}
