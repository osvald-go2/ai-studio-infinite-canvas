import { GitDiff } from '../types';

export const generateMockDiff = (): GitDiff => {
  const additions = Math.floor(Math.random() * 50) + 5;
  const deletions = Math.floor(Math.random() * 20);
  
  return {
    totalAdditions: additions,
    totalDeletions: deletions,
    files: [
      {
        filename: 'src/App.tsx',
        status: 'M',
        additions: Math.floor(additions * 0.6),
        deletions: Math.floor(deletions * 0.8),
        patch: `@@ -15,7 +15,7 @@\n export default function App() {\n-  const [count, setCount] = useState(0);\n+  const [count, setCount] = useState(1);\n   return (\n     <div>\n-      <p>Count: {count}</p>\n+      <p>Current Count: {count}</p>\n     </div>\n   );\n }`
      },
      {
        filename: 'src/utils/helpers.ts',
        status: 'A',
        additions: Math.floor(additions * 0.4),
        deletions: Math.floor(deletions * 0.2),
        patch: `@@ -0,0 +1,5 @@\n+export const add = (a: number, b: number) => {\n+  return a + b;\n+};\n+\n+export const subtract = (a: number, b: number) => a - b;`
      }
    ]
  };
};
