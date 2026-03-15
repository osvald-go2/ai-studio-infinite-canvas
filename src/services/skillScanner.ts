import { SkillInfo } from '../types';

const MODEL_TO_PLATFORM: Record<string, string> = {
  'claude-code': 'claude',
  'codex': 'codex',
  'gemini-cli': 'gemini',
};

const MOCK_SKILLS: SkillInfo[] = [
  { name: 'commit', description: 'Create a git commit with AI-generated message', filePath: 'mock', source: 'project' },
  { name: 'review-pr', description: 'Review a pull request for issues and improvements', filePath: 'mock', source: 'project' },
  { name: 'test-runner', description: 'Run project test suite and analyze failures', filePath: 'mock', source: 'user', pluginName: 'superpowers' },
  { name: 'refactor', description: 'Refactor selected code for better readability', filePath: 'mock', source: 'user', pluginName: 'superpowers' },
  { name: 'explain-code', description: 'Explain how a piece of code works', filePath: 'mock', source: 'user', pluginName: 'superpowers' },
  { name: 'fix-bug', description: 'Diagnose and fix a bug from error output', filePath: 'mock', source: 'project' },
  { name: 'create-test', description: 'Generate unit tests for a function or module', filePath: 'mock', source: 'project' },
  { name: 'polish', description: 'Final quality pass before shipping', filePath: 'mock', source: 'user', pluginName: 'impeccable' },
];

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.aiBackend !== undefined;
}

export async function scanSkills(model: string, projectDir?: string | null): Promise<SkillInfo[]> {
  const platform = MODEL_TO_PLATFORM[model];
  if (!platform) return [];

  if (isElectron() && projectDir) {
    try {
      return await window.aiBackend.scanSkills(platform, projectDir);
    } catch (e) {
      console.warn('[skillScanner] scan failed:', e);
      return [];
    }
  }

  // Browser mock
  return MOCK_SKILLS;
}
