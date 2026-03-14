import { GitDiff } from '../types';

export const generateMockDiff = (): GitDiff => {
  const additions = Math.floor(Math.random() * 50) + 5;
  const deletions = Math.floor(Math.random() * 20) + 5;

  return {
    totalAdditions: additions,
    totalDeletions: deletions,
    files: [
      {
        filename: 'src/App.tsx',
        status: 'M',
        additions: Math.floor(additions * 0.5),
        deletions: Math.floor(deletions * 0.4),
        patch: `@@ -15,7 +15,7 @@\n export default function App() {\n-  const [count, setCount] = useState(0);\n+  const [count, setCount] = useState(1);\n   return (\n     <div>\n-      <p>Count: {count}</p>\n+      <p>Current Count: {count}</p>\n     </div>\n   );\n }`
      },
      {
        filename: 'src/utils/helpers.ts',
        status: 'A',
        additions: Math.floor(additions * 0.3),
        deletions: 0,
        patch: `@@ -0,0 +1,5 @@\n+export const add = (a: number, b: number) => {\n+  return a + b;\n+};\n+\n+export const subtract = (a: number, b: number) => a - b;`
      },
      {
        filename: 'src/legacy/old-api.ts',
        status: 'D',
        additions: 0,
        deletions: Math.floor(deletions * 0.6),
        patch: `@@ -1,6 +0,0 @@\n-import { OldClient } from './client';\n-\n-export async function fetchLegacyData() {\n-  const client = new OldClient();\n-  return client.get('/api/v1/data');\n-}`
      }
    ]
  };
};
