import React from 'react';
import { ContentBlock } from '../../types';
import { TextBlock } from './TextBlock';
import { ToolCallBlock } from './ToolCallBlock';
import { TodoListBlock } from './TodoListBlock';
import { SubagentBlock } from './SubagentBlock';
import { AskUserBlock } from './AskUserBlock';
import { SkillBlock } from './SkillBlock';
import { CodeBlock } from '../CodeBlock';

export function ContentBlocksView({
  blocks,
  isStreaming,
}: {
  blocks: ContentBlock[];
  isStreaming?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        switch (block.type) {
          case 'text':
            return <TextBlock key={i} content={block.content} isStreaming={isStreaming && isLast} />;
          case 'code':
            return <CodeBlock key={i} code={block.code} language={block.language} />;
          case 'tool_call':
            return <ToolCallBlock key={i} {...block} />;
          case 'todolist':
            return <TodoListBlock key={i} items={block.items} />;
          case 'subagent':
            return <SubagentBlock key={i} {...block} />;
          case 'askuser':
            return <AskUserBlock key={i} {...block} />;
          case 'skill':
            return <SkillBlock key={i} {...block} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
