import { useCallback, useEffect, useState } from 'react';
import { api, onEvent } from './api';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { HomeView } from './components/HomeView';
import { InstancePage } from './components/InstancePage';
import { BrowsePage } from './components/BrowsePage';
import { AccountsPage } from './components/AccountsPage';
import { SettingsPage } from './components/SettingsPage';
import { HelpPage } from './components/HelpPage';
import { NewInstanceModal } from './components/NewInstanceModal';
import { ProgressToasts } from './components/ProgressToasts';
import { IconBack } from './components/Icons';
import type { Account, GameStateEvent, InstanceConfig } from '../../shared/types';

export type Page = 'home' | 'edit' | 'browse' | 'accounts' | 'settings' | 'help';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [running, setRunning] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | undefined>();
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshInstances = useCallback(async () => {
    setInstances(await api.instances.list());
    setRunning(await api.instances.running());
  }, []);

  const refreshAccounts = useCallback(async () => {
    const res = await api.accounts.list();
    setAccounts(res.accounts);
    setActiveAccountId(res.activeId);
  }, []);

  useEffect(() => {
    void refreshInstances();
    void refreshAccounts();
    const off = onEvent<GameStateEvent>('game:state', (e) => {
      setRunning((prev) => (e.running ? [...new Set([...prev, e.instanceId])] : prev.filter((i) => i !== e.instanceId)));
      if (!e.running) void refreshInstances(); // pick up playtime updates
    });
    const timer = setInterval(() => void refreshInstances(), 30_000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [refreshInstances, refreshAccounts]);

  const importPack = async () => {
    setError(null);
    try {
      await api.content.importModpackFile();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      void refreshInstances();
    }
  };

  const selected = instances.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="app">
      <Toolbar
        page={page}
        onNavigate={setPage}
        onAddInstance={() => setShowNew(true)}
        onImportPack={() => void importPack()}
        accounts={accounts}
        activeId={activeAccountId}
        onAccountsChanged={refreshAccounts}
      />
      <div className="content">
        {page === 'home' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {error && (
              <div className="error-text" style={{ padding: '8px 14px 0' }}>
                {error}
              </div>
            )}
            <HomeView
              instances={instances}
              running={running}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={(id) => {
                setSelectedId(id);
                setPage('edit');
              }}
              onRefresh={refreshInstances}
              onError={setError}
            />
          </div>
        )}
        {page === 'edit' && selectedId && (
          <div className="content-page">
            <InstancePage
              instanceId={selectedId}
              running={running.includes(selectedId)}
              onBack={() => setPage('home')}
              onChanged={refreshInstances}
            />
          </div>
        )}
        {page === 'browse' && (
          <div className="content-page">
            <BackRow onBack={() => setPage('home')} />
            <BrowsePage instances={instances} onInstancesChanged={refreshInstances} />
          </div>
        )}
        {page === 'accounts' && (
          <div className="content-page">
            <BackRow onBack={() => setPage('home')} />
            <AccountsPage onChanged={refreshAccounts} />
          </div>
        )}
        {page === 'settings' && (
          <div className="content-page">
            <BackRow onBack={() => setPage('home')} />
            <SettingsPage />
          </div>
        )}
        {page === 'help' && (
          <div className="content-page">
            <BackRow onBack={() => setPage('home')} />
            <HelpPage />
          </div>
        )}
      </div>
      <StatusBar instances={instances} selected={selected} />
      <ProgressToasts />
      {showNew && (
        <NewInstanceModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void refreshInstances();
          }}
        />
      )}
    </div>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <button className="btn small" style={{ marginBottom: 12 }} onClick={onBack}>
      <IconBack width={13} height={13} /> Voltar
    </button>
  );
}
