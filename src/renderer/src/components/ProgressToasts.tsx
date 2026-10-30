import { useEffect, useState } from 'react';
import { onEvent } from '../api';
import type { TaskProgress } from '../../../shared/types';

export function ProgressToasts() {
  const [tasks, setTasks] = useState<Record<string, TaskProgress>>({});

  useEffect(() => {
    return onEvent<TaskProgress>('task:progress', (p) => {
      setTasks((prev) => {
        const next = { ...prev, [p.taskId]: p };
        if (p.done && !p.error) {
          setTimeout(() => {
            setTasks((cur) => {
              const copy = { ...cur };
              delete copy[p.taskId];
              return copy;
            });
          }, 2500);
        }
        return next;
      });
    });
  }, []);

  const list = Object.values(tasks);
  if (!list.length) return null;
  return (
    <div className="toasts">
      {list.map((t) => {
        const pct = t.total > 0 ? Math.round((t.current / t.total) * 100) : 0;
        return (
          <div key={t.taskId} className={`toast ${t.error ? 'error' : ''}`}>
            <div className="t-label">
              <span>{t.label}</span>
              <span style={{ color: t.error ? 'var(--red)' : t.done ? 'var(--green)' : undefined }}>
                {t.error ? 'Erro' : t.done ? 'Concluído' : `${pct}%`}
              </span>
            </div>
            {!t.done && (
              <div className="progress-bar">
                <div style={{ width: `${pct}%` }} />
              </div>
            )}
            {t.error ? <div className="t-detail">{t.error}</div> : t.detail ? <div className="t-detail">{t.detail}</div> : null}
            {t.error && (
              <button
                className="btn small"
                style={{ marginTop: 6 }}
                onClick={() =>
                  setTasks((cur) => {
                    const copy = { ...cur };
                    delete copy[t.taskId];
                    return copy;
                  })
                }
              >
                Fechar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
