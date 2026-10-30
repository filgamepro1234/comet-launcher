import { useMemo, useState } from 'react';
import { api } from '../api';
import {
  IconPlay,
  IconStop,
  IconEdit,
  IconTag,
  IconFolder,
  IconExport,
  IconCopy,
  IconTrash,
  IconLink,
  IconChevron
} from './Icons';
import { LoaderIcon } from './LoaderIcon';
import type { InstanceConfig } from '../../../shared/types';

const loaderLabel: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
};

const UNGROUPED = 'Sem grupo';

export function HomeView({
  instances,
  running,
  selectedId,
  onSelect,
  onEdit,
  onRefresh,
  onError
}: {
  instances: InstanceConfig[];
  running: string[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [groupModal, setGroupModal] = useState<InstanceConfig | null>(null);

  const selected = instances.find((i) => i.id === selectedId) ?? null;
  const isRunning = selected ? running.includes(selected.id) : false;

  const groups = useMemo(() => {
    const map = new Map<string, InstanceConfig[]>();
    for (const inst of instances) {
      const g = inst.group?.trim() || UNGROUPED;
      map.set(g, [...(map.get(g) ?? []), inst]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === UNGROUPED ? -1 : b === UNGROUPED ? 1 : a.localeCompare(b)));
  }, [instances]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    onError(null);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void onRefresh();
    }
  };

  const doLaunch = (id: string) => run(() => api.instances.launch(id));
  const doDelete = () => {
    if (!selected) return;
    if (!confirm(`Apagar a instância "${selected.name}"? Os mundos e mods serão eliminados.`)) return;
    void run(async () => {
      await api.instances.remove(selected.id);
      onSelect(null);
    });
  };

  return (
    <div className="home">
      <div className="inst-area" onClick={() => onSelect(null)}>
        {instances.length === 0 && (
          <div className="empty">Ainda não tens instâncias. Usa «Nova instância» ou «Importar» na barra superior.</div>
        )}
        {groups.map(([group, list]) => (
          <div key={group}>
            <div
              className="group-header"
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(group)) next.delete(group);
                  else next.add(group);
                  return next;
                });
              }}
            >
              <IconChevron open={!collapsed.has(group)} width={13} height={13} />
              {group}
              <span className="line" />
              <span>{list.length}</span>
            </div>
            {!collapsed.has(group) && (
              <div className="inst-grid">
                {list.map((inst) => (
                  <div
                    key={inst.id}
                    className={`inst-card ${inst.id === selectedId ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(inst.id);
                    }}
                    onDoubleClick={() => void doLaunch(inst.id)}
                    title={`${inst.name}\n${inst.mcVersion} · ${loaderLabel[inst.loader]}${running.includes(inst.id) ? '\nEm execução' : ''}`}
                  >
                    <div className="tile" style={{ position: 'relative' }}>
                      <LoaderIcon loader={inst.loader} size={38} />
                      {running.includes(inst.id) && <span className="running-dot" style={{ right: 3, top: 3 }} />}
                    </div>
                    <div className="label">{inst.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="side-panel">
        {!selected ? (
          <div className="sp-empty">Seleciona uma instância para veres as ações.</div>
        ) : (
          <>
            <div className="sp-icon">
              <LoaderIcon loader={selected.loader} size={54} />
            </div>
            <div className="sp-name">{selected.name}</div>
            <div className="sp-sub">
              {selected.mcVersion} · {loaderLabel[selected.loader]}
              {selected.loaderVersion ? ` ${selected.loaderVersion}` : ''}
            </div>
            {isRunning ? (
              <button className="sp-btn danger" onClick={() => void api.instances.kill(selected.id)}>
                <IconStop /> Terminar
              </button>
            ) : (
              <button className="sp-btn primary" disabled={busy} onClick={() => void doLaunch(selected.id)}>
                <IconPlay /> {busy ? 'A preparar…' : 'Lançar'}
              </button>
            )}
            <hr />
            <button className="sp-btn" onClick={() => onEdit(selected.id)}>
              <IconEdit /> Editar
            </button>
            <button className="sp-btn" onClick={() => setGroupModal(selected)}>
              <IconTag /> Mudar grupo
            </button>
            <button className="sp-btn" onClick={() => void api.instances.openFolder(selected.id)}>
              <IconFolder /> Pasta
            </button>
            <button className="sp-btn" disabled={busy} onClick={() => void run(() => api.instances.export(selected.id))}>
              <IconExport /> Exportar
            </button>
            <button className="sp-btn" disabled={busy} onClick={() => void run(() => api.instances.duplicate(selected.id))}>
              <IconCopy /> Duplicar
            </button>
            <button className="sp-btn danger" disabled={busy || isRunning} onClick={doDelete}>
              <IconTrash /> Apagar
            </button>
            <button className="sp-btn" onClick={() => void run(() => api.instances.shortcut(selected.id))}>
              <IconLink /> Criar atalho
            </button>
          </>
        )}
      </div>

      {groupModal && (
        <ChangeGroupModal
          instance={groupModal}
          existingGroups={groups.map(([g]) => g).filter((g) => g !== UNGROUPED)}
          onClose={() => setGroupModal(null)}
          onSaved={() => {
            setGroupModal(null);
            void onRefresh();
          }}
        />
      )}
    </div>
  );
}

function ChangeGroupModal({
  instance,
  existingGroups,
  onClose,
  onSaved
}: {
  instance: InstanceConfig;
  existingGroups: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [group, setGroup] = useState(instance.group ?? '');
  const save = async () => {
    await api.instances.update(instance.id, { group: group.trim() || undefined });
    onSaved();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Mudar grupo — {instance.name}</h3>
        <label className="field">
          <span>Nome do grupo (vazio = sem grupo)</span>
          <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="ex.: Modpacks" list="group-suggestions" />
          <datalist id="group-suggestions">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        {existingGroups.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            {existingGroups.map((g) => (
              <button key={g} className="btn small" style={{ flex: 'none' }} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={() => void save()}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
