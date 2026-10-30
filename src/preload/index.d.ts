export interface IpcResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface CometApi {
  invoke: <T>(channel: string, ...args: unknown[]) => Promise<IpcResult<T>>;
  on: (channel: string, cb: (payload: unknown) => void) => () => void;
}

declare global {
  interface Window {
    comet: CometApi;
  }
}
