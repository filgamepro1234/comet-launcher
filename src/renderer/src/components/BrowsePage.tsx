import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { IconSearch, IconDownload, IconCheck, IconPlus } from './Icons';
import type {
  ContentSearchHit,
  ContentSort,
  ContentType,
  InstanceConfig,
  LoaderKind,
  McVersionInfo
} from '../../../shared/types';

const MODRINTH_CATEGORIES = [
  'adventure',
  'decoration',
  'equipment',
  'food',
  'game-mechanics',
  'library',
  'magic',
  'management',
  'minigame',
  'mobs',
  'optimization',
  'social',
  'storage',
  'technology',
  'transportation',
  'utility',
  'worldgen'
];

const typeLabels: [ContentType, string][] = [
  ['mod', 'Mods'],
  ['resourcepack', 'Resource Packs'],
  ['modpack', 'Modpacks']
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function BrowsePage({
  instances,
  onInstancesChanged
}: {
  instances: InstanceConfig[];
  onInstancesChanged: () => Promise<void>;
}) {
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth');
  const [type, setType] = useState<ContentType>('mod');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ContentSort>('relevance');
  const [targetId, setTargetId] = useState('');
  const [mcVersion, setMcVersion] = useState(''); // '' = da instância alvo
  const [loader, setLoader] = useState<'' | LoaderKind>(''); // '' = da instância alvo
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [mcVersions, setMcVersions] = useState<McVersionInfo[]>([]);
  const [hits, setHits] = useState<ContentSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  const target = instances.find((i) => i.id === targetId) ?? instances[0];
  useEffect(() => {
    if (!targetId && instances.length) setTargetId(instances[0].id);
  }, [instances, targetId]);
  useEffect(() => {
    api.versions.mc(false).then(setMcVersions).catch(() => {});
  }, []);

  const effMcVersion = mcVersion || target?.mcVersion;
  const effLoader: LoaderKind | undefined = loader || target?.loader;

  const search = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.content.search({
          source,
          type,
          query,
          mcVersion: type !== 'modpack' ? effMcVersion : undefined,
          loader: type === 'mod' ? effLoader : undefined,
          page: pageNum,
          sort,
          categories: source === 'modrinth' ? [...cats] : undefined
        });
        setHits(res.hits);
        setTotal(res.total);
        setPage(pageNum);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.includes('CF_KEY_MISSING') ? 'Falta a API key do CurseForge — configura-a nas Definições.' : msg);
        setHits([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [source, type, query, effMcVersion, effLoader, sort, cats]
  );

  useEffect(() => {
    void search(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, type, targetId, mcVersion, loader, sort, cats]);

  const install = async (hit: ContentSearchHit) => {
    setInstalling(hit.projectId);
    setError(null);
    try {
      if (type === 'modpack') {
        await api.content.installModpack(source, hit.projectId);
        await onInstancesChanged();
      } else {
        if (!target) throw new Error('Cria primeiro uma instância para instalar conteúdo.');
        await api.content.install(source, type, hit.projectId, target.id);
      }
      setInstalled((prev) => new Set(prev).add(hit.projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(null);
    }
  };

  const pageSize = 20;
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  return (
    <div className="browse">
      {/* ===== filtros (estilo modrinth.com/discover) ===== */}
      <div className="filters">
        <h5>Fonte</h5>
        <div className="chips">
          {(['modrinth', 'curseforge'] as const).map((s) => (
            <button key={s} className={`chip ${source === s ? 'on' : ''}`} onClick={() => setSource(s)}>
              {s === 'modrinth' ? 'Modrinth' : 'CurseForge'}
            </button>
          ))}
        </div>
        <h5>Tipo</h5>
        <div className="chips">
          {typeLabels.map(([t, label]) => (
            <button key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
              {label}
            </button>
          ))}
        </div>
        {type !== 'modpack' && (
          <>
            <h5>Instalar em</h5>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {instances.length === 0 && <option value="">(sem instâncias)</option>}
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <h5>Versão do jogo</h5>
            <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
              <option value="">{target ? `Da instância (${target.mcVersion})` : 'Todas'}</option>
              {mcVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </>
        )}
        {type === 'mod' && (
          <>
            <h5>Loader</h5>
            <select value={loader} onChange={(e) => setLoader(e.target.value as '' | LoaderKind)}>
              <option value="">{target ? `Da instância (${target.loader})` : 'Todos'}</option>
              <option value="fabric">Fabric</option>
              <option value="quilt">Quilt</option>
              <option value="forge">Forge</option>
              <option value="neoforge">NeoForge</option>
            </select>
          </>
        )}
        {source === 'modrinth' && type === 'mod' && (
          <>
            <h5>Categorias</h5>
            <div className="chips">
              {MODRINTH_CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={`chip ${cats.has(c) ? 'on' : ''}`}
                  onClick={() =>
                    setCats((prev) => {
                      const next = new Set(prev);
                      if (next.has(c)) next.delete(c);
                      else next.add(c);
                      return next;
                    })
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ===== resultados ===== */}
      <div className="browse-main">
        <form
          className="row"
          style={{ marginBottom: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            void search(0);
          }}
        >
          <div style={{ position: 'relative', flex: 3 }}>
            <IconSearch
              width={15}
              height={15}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
            />
            <input
              className="search-input"
              type="text"
              placeholder={`Pesquisar ${typeLabels.find(([t]) => t === type)?.[1].toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as ContentSort)} style={{ flex: 1, maxWidth: 180 }}>
            <option value="relevance">Relevância</option>
            <option value="downloads">Descargas</option>
            <option value="updated">Atualizados recentemente</option>
            <option value="newest">Mais recentes</option>
          </select>
        </form>

        {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
        {loading && <div className="empty">A pesquisar…</div>}

        {!loading &&
          hits.map((h) => (
            <div key={`${h.source}-${h.projectId}`} className="proj-card">
              {h.iconUrl ? (
                <img className="icon" src={h.iconUrl} alt="" loading="lazy" />
              ) : (
                <div className="icon placeholder" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="p-title">
                  {h.title} <span className="p-author">por {h.author}</span>
                </div>
                <div className="p-desc">{h.description}</div>
                {h.categories?.length ? (
                  <div className="chips">
                    {h.categories.slice(0, 5).map((c) => (
                      <span key={c} className="chip static">
                        {c}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="proj-stats">
                <div className="big">
                  <IconDownload width={13} height={13} /> {formatCount(h.downloads)}
                </div>
                {h.follows !== undefined && <div>{formatCount(h.follows)} seguidores</div>}
                {h.updated && <div>Atualizado {formatDate(h.updated)}</div>}
                <button
                  className="btn small primary"
                  style={{ marginTop: 6 }}
                  disabled={installing === h.projectId || installed.has(h.projectId)}
                  onClick={() => void install(h)}
                >
                  {installed.has(h.projectId) ? (
                    <>
                      <IconCheck width={12} height={12} /> Instalado
                    </>
                  ) : installing === h.projectId ? (
                    'A instalar…'
                  ) : (
                    <>
                      <IconPlus width={12} height={12} /> {type === 'modpack' ? 'Criar instância' : 'Instalar'}
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        {!loading && hits.length === 0 && !error && <div className="empty">Sem resultados.</div>}

        {total > pageSize && (
          <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}>
            <button className="btn small" style={{ flex: 'none' }} disabled={page === 0 || loading} onClick={() => void search(page - 1)}>
              Anterior
            </button>
            <span style={{ flex: 'none', color: 'var(--text-dim)', fontSize: 12 }}>
              Página {page + 1} de {maxPage + 1} · {formatCount(total)} resultados
            </span>
            <button className="btn small" style={{ flex: 'none' }} disabled={page >= maxPage || loading} onClick={() => void search(page + 1)}>
              Seguinte
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
