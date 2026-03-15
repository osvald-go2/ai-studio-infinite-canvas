import { ContentBlock, Message } from '../types';

const isElectron = typeof window !== 'undefined' && window.aiBackend !== undefined;

export const backend = {
  async createSession(model: string, history?: Message[]): Promise<string> {
    if (!isElectron) {
      return `mock-${Date.now()}`;
    }
    const result = await window.aiBackend.invoke('session.create', {
      model,
      history: history?.map(m => ({ role: m.role, content: m.content })),
    });
    return result.session_id;
  },

  async sendMessage(sessionId: string, text: string): Promise<void> {
    if (!isElectron) return;
    await window.aiBackend.invoke('session.send', {
      session_id: sessionId,
      text,
    });
  },

  async listSessions(): Promise<any[]> {
    if (!isElectron) return [];
    const result = await window.aiBackend.invoke('session.list');
    return result.sessions;
  },

  async killSession(sessionId: string): Promise<void> {
    if (!isElectron) return;
    await window.aiBackend.invoke('session.kill', {
      session_id: sessionId,
    });
  },

  async setApiKey(apiKey: string): Promise<void> {
    if (!isElectron) return;
    await window.aiBackend.invoke('config.set_api_key', {
      api_key: apiKey,
    });
  },

  async ping(): Promise<boolean> {
    if (!isElectron) return true;
    try {
      await window.aiBackend.invoke('ping');
      return true;
    } catch {
      return false;
    }
  },

  onBlockStart(callback: (data: { session_id: string; block_index: number; block: ContentBlock }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('block.start', callback);
  },

  onBlockDelta(callback: (data: { session_id: string; block_index: number; delta: any }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('block.delta', callback);
  },

  onBlockStop(callback: (data: { session_id: string; block_index: number }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('block.stop', callback);
  },

  onMessageComplete(callback: (data: { session_id: string; usage?: any }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('message.complete', callback);
  },

  onMessageError(callback: (data: { session_id: string; error: { code: number; message: string } }) => void): void {
    if (!isElectron) return;
    window.aiBackend.on('message.error', callback);
  },

  onSidecarRestarted(callback: () => void): void {
    if (!isElectron) return;
    window.aiBackend.on('sidecar.restarted', callback);
  },
};
