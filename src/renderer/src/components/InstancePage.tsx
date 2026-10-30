import { useCallback, useEffect, useRef, useState } from 'react';
import { api, onEvent } from '../api';
import { IconBack, IconPlay, IconStop, IconFolder, IconCopy, IconTrash, IconRefresh, IconArrowUp } from './Icons';
import type {
  GameLogEvent,
  InstanceConfig,
  LocalMod,
  ModUpdateInfo,
  ResourcePackInfo,
  ScreenshotInfo
} from '../../../shared/types';

type Tab = 'mods' | 'resourcepacks' | 'screenshots' | 'logs' | 'settings';

export function InstancePage({
  instanceId,
  running,
  onBack,
  onChanged
}: {
  instanceId: string;
  running: boolean;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [inst, setInst] = useState<InstanceConfig | null>(null);
  const [tab, setTab] = useState<Tab>('mods');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setInst(await api.instances.get(instanceId));
  }, [instanceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!inst) return <div className="empty">A carregar…</div>;

  const doLaunch = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.instances.launch(instanceId);
      setTab('logs');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void onChanged();
    }
  };

  const doDelete = async () => {
    if (!confirm(`Apagar a instância "${inst.name}"? Os mundos e mods serão eliminados.`)) return;
    try {
      await api.instances.remove(instanceId);
      await onChanged();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="page-title">
        <button className="btn small" onClick={onBack} title="Voltar">
          <IconBack width={13} height={13} />
        </button>
        {inst.name}
        <span className="sub">
          {inst.mcVersion} · {inst.loader}
          {inst.loaderVersion ? ` ${inst.loaderVersion}` : ''}
        </span>
        <div style={{ flex: 1 }} />
        {running ? (
          <button className="btn danger" onClick={() => void api.instances.kill(instanceId)}>
            <IconStop width={14} height={14} /> Terminar
          </button>
        ) : (
          <button className="btn primary" disabled={busy} onClick={() => void doLaunch()}>
            <IconPlay width={14} height={14} /> {busy ? 'A preparar…' : 'Lançar'}
          </button>
        )}
        <button className="btn" onClick={() => void api.instances.openFolder(instanceId)}>
          <IconFolder width={14} height={14} /> Pasta
        </button>
        <button
          className="btn"
          onClick={() =>
            void api.instances.duplicate(instanceId).then(() => {
              void onChanged();
            })
          }
        >
          <IconCopy width={14} height={14} /> Duplicar
        </button>
        <button className="btn danger" onClick={() => void doDelete()} title="Apagar instância">
          <IconTrash width={14} height={14} />
        </button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="tabs">
        {(
          [
            ['mods', 'Mods'],
            ['resourcepacks', 'Resource Packs'],
            ['screenshots', 'Screenshots'],
            ['logs', 'Consola'],
            ['settings', 'Definições']
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'mods' && <ModsTab instanceId={instanceId} />}
      {tab === 'resourcepacks' && <ResourcePacksTab instanceId={instanceId} />}
      {tab === 'screenshots' && <ScreenshotsTab instanceId={instanceId} />}
      {tab === 'logs' && <LogsTab instanceId={instanceId} />}
      {tab === 'settings' && <InstanceSettingsTab inst={inst} onSaved={reload} />}
    </>
  );
}

function ModsTab({ instanceId }: { instanceId: string }) {
  const [mods, setMods] = useState<LocalMod[]>([]);
  const [updates, setUpdates] = useState<ModUpdateInfo[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () => api.mods.list(instanceId).then(setMods).catch((e) => setError(String(e))),
    [instanceId]
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const checkUpdates = async () => {
    setChecking(true);
    setError(null);
    try {
      setUpdates(await api.mods.checkUpdates(instanceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const applyUpdate = async (u: ModUpdateInfo) => {
    try {
      await api.mods.applyUpdate(instanceId, u);
      setUpdates((prev) => prev.filter((x) => x.fileName !== u.fileName));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12, justifyContent: 'flex-start' }}>
        <button className="btn small" style={{ flex: 'none' }} disabled={checking} onClick={() => void checkUpdates()}>
          <IconRefresh width={13} height={13} /> {checking ? 'A verificar…' : 'Verificar atualizações'}
        </button>
        {updates.length > 0 && (
          <span className="badge yellow" style={{ flex: 'none' }}>
            {updates.length} atualização(ões)
          </span>
        )}
      </div>
      {error && <div className="error-text" style={{ marginBottom: 8 }}>{error}</div>}
      {mods.length === 0 ? (
        <div className="empty">Sem mods. Vai a «Explorar» para instalar mods nesta instância.</div>
      ) : (
        <div className="list">
          {mods.map((m) => {
            const update = updates.find((u) => u.fileName === m.fileName);
            return (
              <div key={m.fileName} className={`list-item ${m.enabled ? '' : 'disabled'}`}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={m.enabled}
                  title={m.enabled ? 'Desativar' : 'Ativar'}
                  onChange={() =>
                    void api.mods.toggle(instanceId, m.fileName, !m.enabled).then(reload).catch((e) => setError(String(e)))
                  }
                />
                <div className="grow">
                  <div className="title">
                    {m.displayName}{' '}
                    {m.version && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>{m.version}</span>}
                  </div>
                  <div className="sub">
                    {m.fileName} · {(m.size / 1024).toFixed(0)} KB · {m.source}
                  </div>
                  {m.conflictsWith?.length ? (
                    <div className="sub" style={{ color: 'var(--yellow)' }}>
                      Conflito (mesmo modid): {m.conflictsWith.join(', ')}
                    </div>
                  ) : null}
                </div>
                {update && (
                  <button className="btn small primary" onClick={() => void applyUpdate(update)} title={update.newVersionName}>
                    <IconArrowUp width={12} height={12} /> Atualizar
                  </button>
                )}
                <button
                  className="btn small danger"
                  title="Apagar"
                  onClick={() => void api.mods.remove(instanceId, m.fileName).then(reload).catch((e) => setError(String(e)))}
                >
                  <IconTrash width={13} height={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ResourcePacksTab({ instanceId }: { instanceId: string }) {
  const [packs, setPacks] = useState<ResourcePackInfo[]>([]);
  const reload = useCallback(() => api.rp.list(instanceId).then(setPacks), [instanceId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return packs.length === 0 ? (
    <div className="empty">Sem resource packs. Instala a partir de «Explorar».</div>
  ) : (
    <div className="list">
      {packs.map((p) => (
        <div key={p.fileName} className="list-item">
          <div className="grow">
            <div className="title">{p.fileName}</div>
            <div className="sub">
              {(p.size / 1024 / 1024).toFixed(1)} MB{p.description ? ` · ${p.description}` : ''}
            </div>
          </div>
          <button className="btn small danger" title="Apagar" onClick={() => void api.rp.remove(instanceId, p.fileName).then(reload)}>
            <IconTrash width={13} height={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ScreenshotsTab({ instanceId }: { instanceId: string }) {
  const [shots, setShots] = useState<ScreenshotInfo[]>([]);
  const reload = useCallback(() => api.shots.list(instanceId).then(setShots), [instanceId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <>
      <div className="row" style={{ marginBottom: 12, justifyContent: 'flex-start' }}>
        <button className="btn small" style={{ flex: 'none' }} onClick={() => void api.shots.openFolder(instanceId)}>
          <IconFolder width={13} height={13} /> Abrir pasta
        </button>
        <button className="btn small" style={{ flex: 'none' }} onClick={() => void reload()}>
          <IconRefresh width={13} height={13} /> Atualizar
        </button>
      </div>
      {shots.length === 0 ? (
        <div className="empty">Sem screenshots (F2 dentro do jogo).</div>
      ) : (
        <div className="shots-grid">
          {shots.map((s) => (
            <div key={s.name} className="shot">
              <img src={s.url} alt={s.name} loading="lazy" />
              <div className="shot-bar">
                <span title={s.name}>{new Date(s.mtime).toLocaleString('pt-PT')}</span>
                <button className="btn small danger" title="Apagar" onClick={() => void api.shots.remove(instanceId, s.name).then(reload)}>
                  <IconTrash width={12} height={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface LogLine {
  line: string;
  stream: string;
}

function LogsTab({ instanceId }: { instanceId: string }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onEvent<GameLogEvent>('game:log', (e) => {
      if (e.instanceId !== instanceId) return;
      setLines((prev) => [...prev.slice(-1500), { line: e.line, stream: e.stream }]);
    });
  }, [instanceId]);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const loadFile = async () => {
    const text = await api.logs.latest(instanceId);
    setLines(text ? text.split('\n').map((l) => ({ line: l, stream: 'stdout' })) : []);
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12, justifyContent: 'flex-start' }}>
        <button className="btn small" style={{ flex: 'none' }} onClick={() => void loadFile()}>
          Carregar latest.log
        </button>
        <button className="btn small" style={{ flex: 'none' }} onClick={() => setLines([])}>
          Limpar
        </button>
      </div>
      <div className="console" ref={boxRef}>
        {lines.length === 0 ? (
          <span style={{ color: 'var(--text-dim)' }}>A consola mostra o output do jogo em tempo real.</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={l.stream !== 'stdout' ? l.stream : undefined}>
              {l.line}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function InstanceSettingsTab({ inst, onSaved }: { inst: InstanceConfig; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(inst.name);
  const [minMem, setMinMem] = useState(inst.memory?.min ?? 1024);
  const [maxMem, setMaxMem] = useState(inst.memory?.max ?? 4096);
  const [jvmArgs, setJvmArgs] = useState(inst.jvmArgs ?? '');
  const [javaPath, setJavaPath] = useState(inst.javaPath ?? '');
  const [width, setWidth] = useState(inst.width ?? 0);
  const [height, setHeight] = useState(inst.height ?? 0);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await api.instances.update(inst.id, {
      name: name.trim() || inst.name,
      memory: { min: Math.min(minMem, maxMem), max: Math.max(minMem, maxMem) },
      jvmArgs: jvmArgs.trim() || undefined,
      javaPath: javaPath.trim() || undefined,
      width: width || undefined,
      height: height || undefined
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await onSaved();
  };

  return (
    <div className="section">
      <label className="field">
        <span>Nome</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <label className="field">
          <span>RAM mínima (MB)</span>
          <input type="number" min={256} step={256} value={minMem} onChange={(e) => setMinMem(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>RAM máxima (MB)</span>
          <input type="number" min={512} step={256} value={maxMem} onChange={(e) => setMaxMem(Number(e.target.value))} />
        </label>
      </div>
      <label className="field">
        <span>Argumentos JVM extra</span>
        <input type="text" value={jvmArgs} placeholder="-XX:+UseG1GC …" onChange={(e) => setJvmArgs(e.target.value)} />
      </label>
      <label className="field">
        <span>Java personalizado (caminho do executável java — vazio = automático)</span>
        <input
          type="text"
          value={javaPath}
          placeholder="C:\\Program Files\\Java\\...\\javaw.exe  ou  /usr/lib/jvm/.../bin/java"
          onChange={(e) => setJavaPath(e.target.value)}
        />
      </label>
      <div className="row">
        <label className="field">
          <span>Largura da janela (0 = predefinida)</span>
          <input type="number" min={0} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Altura da janela</span>
          <input type="number" min={0} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
        </label>
      </div>
      <button className="btn primary" onClick={() => void save()}>
        {saved ? 'Guardado' : 'Guardar'}
      </button>
    </div>
  );
}
