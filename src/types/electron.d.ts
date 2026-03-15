interface AiBackend {
  invoke(method: string, params?: any): Promise<any>;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
  onAll(callback: (event: string, data: any) => void): void;
  getWorkingDir(): Promise<string>;
  openDirectory(): Promise<string | null>;
  getLastProjectDir(): Promise<string | null>;
  scanSkills(platform: string, projectDir: string): Promise<any>;
}

interface Window {
  aiBackend: AiBackend;
}
