import { useCallback, useEffect, useState } from 'react';
import { api, onEvent } from '../api';
import { IconPlus, IconTrash, IconUser, IconCopy } from './Icons';
import type { Account, DeviceCodeInfo } from '../../../shared/types';

export function AccountsPage({ onChanged }: { onChanged: () => Promise<void> }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [offlineName, setOfflineName] = useState('');
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null);
  const [msLoading, setMsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await api.accounts.list();
    setAccounts(res.accounts);
    setActiveId(res.activeId);
    await onChanged();
  }, [onChanged]);

  useEffect(() => {
    void reload();
    return onEvent<DeviceCodeInfo>('auth:device', setDevice);
  }, [reload]);

  const addOffline = async () => {
    setError(null);
    try {
      await api.accounts.addOffline(offlineName);
      setOfflineName('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addMicrosoft = async () => {
    setError(null);
    setMsLoading(true);
    try {
      await api.accounts.addMicrosoft();
      setDevice(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDevice(null);
    } finally {
      setMsLoading(false);
    }
  };

  return (
    <>
      <div className="page-title">Contas</div>
      <div className="section">
        <h4>Contas configuradas</h4>
        {accounts.length === 0 ? (
          <div className="hint">Nenhuma conta. Adiciona uma conta Microsoft (online) ou offline.</div>
        ) : (
          <div className="list">
            {accounts.map((a) => (
              <div key={a.id} className="list-item">
                <span className={`dot ${a.type === 'microsoft' ? 'online' : 'offline'}`} />
                <div className="grow">
                  <div className="title">{a.username}</div>
                  <div className="sub">
                    {a.type === 'microsoft' ? 'Microsoft (online)' : 'Offline'} · {a.uuid}
                  </div>
                </div>
                {a.id === activeId ? (
                  <span className="badge green">Ativa</span>
                ) : (
                  <button className="btn small" onClick={() => void api.accounts.setActive(a.id).then(reload)}>
                    Usar
                  </button>
                )}
                <button className="btn small danger" title="Remover" onClick={() => void api.accounts.remove(a.id).then(reload)}>
                  <IconTrash width={13} height={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h4>Adicionar conta Microsoft</h4>
        <button className="btn primary" disabled={msLoading} onClick={() => void addMicrosoft()}>
          <IconUser width={13} height={13} /> {msLoading ? 'A aguardar autenticação…' : 'Iniciar sessão Microsoft'}
        </button>
        <div className="hint">
          Requer um Client ID da Azure configurado nas Definições (app pública com device code flow ativado).
        </div>
        {device && (
          <div style={{ marginTop: 12 }}>
            <div className="hint">
              Abre <b>{device.verificationUri}</b> e introduz o código:
            </div>
            <div className="device-code">{device.userCode}</div>
            <button
              className="btn small"
              onClick={() => {
                void navigator.clipboard.writeText(device.userCode);
              }}
            >
              <IconCopy width={12} height={12} /> Copiar código
            </button>{' '}
            <a className="btn small" href={device.verificationUri} target="_blank" rel="noreferrer">
              Abrir site
            </a>
          </div>
        )}
      </div>

      <div className="section">
        <h4>Adicionar conta offline</h4>
        <div className="row">
          <input
            type="text"
            placeholder="Nome de jogador (3–16 caracteres)"
            value={offlineName}
            onChange={(e) => setOfflineName(e.target.value)}
          />
          <button className="btn" style={{ flex: 'none' }} disabled={!offlineName.trim()} onClick={() => void addOffline()}>
            <IconPlus width={12} height={12} /> Adicionar
          </button>
        </div>
        <div className="hint">Contas offline só funcionam em servidores com online-mode=false e em singleplayer.</div>
      </div>
      {error && <div className="error-text">{error}</div>}
    </>
  );
}
