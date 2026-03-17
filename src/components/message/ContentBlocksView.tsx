import React from 'react';
import { ContentBlock } from '../../types';
import { TextBlock } from './TextBlock';
import { ToolCallBlock } from './ToolCallBlock';
import { TodoListBlock } from './TodoListBlock';
import { SubagentBlock } from './SubagentBlock';
import { AskUserBlock } from './AskUserBlock';
import { SkillBlock } from './SkillBlock';
import { FileChangesBlock } from './FileChangesBlock';
import { CodeBlock } from '../CodeBlock';
import { FormTableBlock } from './FormTableBlock';

export function ContentBlocksView({
  blocks,
  isStreaming,
  onSendMessage,
}: {
  blocks: ContentBlock[];
  isStreaming?: boolean;
  onSendMessage?: (text: string) => void;
}) {
  // Filter out system status blocks (e.g. "Connected: ...")
  const visibleBlocks = blocks.filter(
    b => !(b.type === 'text' && b.content.startsWith('Connected:'))
  );

  // Group consecutive done Read/Write tool_calls into a single summary line
  const grouped: { block: ContentBlock; index: number; grouped?: ContentBlock[] }[] = [];
  const COLLAPSIBLE = new Set(['read', 'write']);

  for (let i = 0; i < visibleBlocks.length; i++) {
    const block = visibleBlocks[i];
    if (
      block.type === 'tool_call' &&
      block.status === 'done' &&
      COLLAPSIBLE.has(block.tool.toLowerCase())
    ) {
      const prev = grouped[grouped.length - 1];
      if (
        prev?.block.type === 'tool_call' &&
        prev.block.status === 'done' &&
        prev.block.tool.toLowerCase() === block.tool.toLowerCase()
      ) {
        if (!prev.grouped) prev.grouped = [prev.block];
        prev.grouped.push(block);
        continue;
      }
    }
    grouped.push({ block, index: i });
  }

  return (
    <div className="space-y-2.5">
      {grouped.map(({ block, index, grouped: grp }) => {
        const isLast = index === visibleBlocks.length - 1;
        if (grp && block.type === 'tool_call') {
          return (
            <ToolCallBlock
              key={index}
              {...block}
              description={`${grp.length} files`}
            />
          );
        }
        switch (block.type) {
          case 'text':
            return <TextBlock key={index} content={block.content} isStreaming={isStreaming && isLast} />;
          case 'code':
            return <CodeBlock key={index} code={block.code} language={block.language} />;
          case 'tool_call':
            return <ToolCallBlock key={index} {...block} />;
          case 'todolist':
            return <TodoListBlock key={index} items={block.items} />;
          case 'subagent':
            return <SubagentBlock key={index} {...block} />;
          case 'askuser':
            return <AskUserBlock key={index} {...block} onSubmit={onSendMessage} />;
          case 'skill':
            return <SkillBlock key={index} {...block} />;
          case 'file_changes':
            return <FileChangesBlock key={index} {...block} />;
          case 'form_table':
            return <FormTableBlock key={index} {...block} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
