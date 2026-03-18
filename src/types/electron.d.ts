interface AiBackend {
  invoke(method: string, params?: any): Promise<any>;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
  onAll(callback: (event: string, data: any) => void): void;
  getWorkingDir(): Promise<string>;
  openDirectory(): Promise<string | null>;
  getLastProjectDir(): Promise<string | null>;
  scanSkills(platform: string, projectDir: string): Promise<any>;

  // Island integration
  notifyIsland(event: string, data: any): void;
  onIslandMessage(callback: (data: { sessionId: string; content: string }) => void): void;
  onIslandCancel(callback: (data: { sessionId: string }) => void): void;
  onIslandFetchMessages(callback: (data: { sessionId: string }) => void): void;
  onIslandRequestSessions(callback: () => void): void;
  sendIslandSessionsResponse(sessions: any[]): void;
  sendIslandMessagesHistory(sessionId: string, messages: any[]): void;
}

interface Window {
  aiBackend: AiBackend;
}
