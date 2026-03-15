import { contextBridge, ipcRenderer } from 'electron';

export type EventCallback = (data: any) => void;

contextBridge.exposeInMainWorld('aiBackend', {
  invoke: (method: string, params?: any): Promise<any> => {
    return ipcRenderer.invoke('sidecar:invoke', method, params);
  },

  on: (event: string, callback: EventCallback): void => {
    const handler = (_: any, eventName: string, data: any) => {
      if (eventName === event) {
        callback(data);
      }
    };
    ipcRenderer.on('sidecar:event', handler);
    (callback as any).__handler = handler;
  },

  off: (event: string, callback: EventCallback): void => {
    const handler = (callback as any).__handler;
    if (handler) {
      ipcRenderer.removeListener('sidecar:event', handler);
    }
  },

  onAll: (callback: (event: string, data: any) => void): void => {
    ipcRenderer.on('sidecar:event', (_, eventName, data) => {
      callback(eventName, data);
    });
  },
});
