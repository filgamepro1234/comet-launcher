import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { IconPlus, IconFolder, IconSettings, IconHelp, IconUser, IconPackage } from './Icons';
import type { Account } from '../../../shared/types';
import type { Page } from '../App';

export function Toolbar({
  page,
  onNavigate,
  onAddInstance,
  onImportPack,
  accounts,
  activeId,
  onAccountsChanged
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  onAddInstance: () => void;
  onImportPack: () => void;
  accounts: Account[];
  activeId?: string;
  onAccountsChanged: () => Promise<void>;
}) {
  const [accOpen, setAccOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = accounts.find((a) => a.id === activeId);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAccOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="toolbar">
      <button className="tb-btn" onClick={onAddInstance} title="Criar nova instância">
        <IconPlus /> Nova instância
      </button>
      <button className="tb-btn" onClick={onImportPack} title="Importar modpack (.mrpack / zip CurseForge)">
        <IconPackage /> Importar
      </button>
      <button className="tb-btn" onClick={() => void api.instances.openRoot()} title="Abrir pasta das instâncias">
        <IconFolder /> Pastas
      </button>
      <div className="tb-sep" />
      <button className={`tb-btn ${page === 'browse' ? 'active' : ''}`} onClick={() => onNavigate('browse')}>
        <IconPackage /> Explorar
      </button>
      <button className={`tb-btn ${page === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}>
        <IconSettings /> Definições
      </button>
      <button className={`tb-btn ${page === 'help' ? 'active' : ''}`} onClick={() => onNavigate('help')}>
        <IconHelp /> Ajuda
      </button>
      <div className="tb-spacer" />
      <div className="acc-menu-wrap" ref={wrapRef}>
        <button className={`tb-btn ${accOpen ? 'active' : ''}`} onClick={() => setAccOpen((o) => !o)}>
          <IconUser /> {active ? active.username : 'Contas'}
        </button>
        {accOpen && (
          <div className="acc-menu">
            {accounts.length === 0 && <div className="acc-item sub">Sem contas configuradas</div>}
            {accounts.map((a) => (
              <button
                key={a.id}
                className="acc-item"
                onClick={() => {
                  void api.accounts.setActive(a.id).then(onAccountsChanged);
                  setAccOpen(false);
                }}
              >
                <span className={`dot ${a.type === 'microsoft' ? 'online' : 'offline'}`} />
                <span style={{ flex: 1 }}>
                  {a.username}
                  <div className="sub">{a.type === 'microsoft' ? 'Microsoft' : 'Offline'}</div>
                </span>
                {a.id === activeId && <span style={{ color: 'var(--accent)' }}>ativa</span>}
              </button>
            ))}
            <hr />
            <button
              className="acc-item"
              onClick={() => {
                onNavigate('accounts');
                setAccOpen(false);
              }}
            >
              <IconSettings width={14} height={14} /> Gerir contas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
