import { contextBridge, ipcRenderer } from 'electron';

export interface IpcResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

const api = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, cb: (payload: unknown) => void): (() => void) => {
    const allowed = ['task:progress', 'game:log', 'game:state', 'auth:device'];
    if (!allowed.includes(channel)) throw new Error(`Canal não permitido: ${channel}`);
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
};

contextBridge.exposeInMainWorld('comet', api);

export type CometApi = typeof api;
