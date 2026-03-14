import React from 'react';
import { parseMarkdown } from '../../utils/markdownParser';
import { CodeBlock } from '../CodeBlock';

export function TextBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const segments = parseMarkdown(content);

  return (
    <div className="space-y-3 leading-relaxed text-[15px] text-gray-300">
      {segments.map((seg, i) => {
        if (seg.type === 'code_block') {
          return (
            <div key={i} className="relative">
              <CodeBlock code={seg.code} language={seg.language} />
              {isStreaming && i === segments.length - 1 && (
                <span className="inline-block w-1.5 h-3.5 bg-current animate-pulse absolute bottom-4 right-4"></span>
              )}
            </div>
          );
        }
        return (
          <div
            key={i}
            className="space-y-3 [&>h1]:mt-4 [&>h2]:mt-3 [&>h3]:mt-2 [&>ul]:my-2 [&>ol]:my-2 [&>p]:my-0"
            dangerouslySetInnerHTML={{ __html: seg.html }}
          />
        );
      })}
      {isStreaming && (segments.length === 0 || segments[segments.length - 1].type === 'text') && (
        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current animate-pulse align-middle"></span>
      )}
    </div>
  );
}
