import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubagentBlock } from './SubagentBlock';

function renderSubagent(
  overrides: Partial<React.ComponentProps<typeof SubagentBlock>> = {},
) {
  return renderToStaticMarkup(
    <SubagentBlock
      type="subagent"
      agentId="research-1"
      task="搜索所有 useEffect 的组件并分析依赖数组"
      status="working"
      summary="发现 12 个组件，3 个有潜在依赖问题"
      blocks={[
        { type: 'skill', skill: 'brainstorming', status: 'done', duration: 0.8 },
        { type: 'tool_call', tool: 'read', args: 'src/App.tsx', status: 'done', duration: 0.1 },
        { type: 'text', content: '已整理出 3 个需要修复的依赖项。' },
      ]}
      {...overrides}
    />,
  );
}

const workingHtml = renderSubagent();

assert.match(
  workingHtml,
  /<details class="group rounded-2xl border border-white\/10 bg-\[#2B2D3A\]\/70/,
  'subagent should render as a collapsible details card',
);
assert.match(
  workingHtml,
  /<summary class="[^"]*cursor-pointer[^"]*list-none[^"]*px-3\.5[^"]*py-3/,
  'subagent should expose a compact clickable summary row',
);
assert.match(
  workingHtml,
  /子智能体/,
  'subagent header should use the agent label instead of a raw subagent card title',
);
assert.match(
  workingHtml,
  /h-7 w-7 shrink-0 items-center justify-center rounded-xl/,
  'robot identity icon should use the smaller shared UI scale',
);
assert.match(
  workingHtml,
  /Working/,
  'subagent summary should still expose current status',
);
assert.match(
  workingHtml,
  /src\/App\.tsx/,
  'expanded content should render nested internal blocks',
);

const doneHtml = renderSubagent({ status: 'done', blocks: undefined });

assert.match(doneHtml, />Done</, 'done subagent should render a completion badge');
assert.doesNotMatch(
  doneHtml,
  /子智能体轨迹/,
  'when no nested blocks exist, the expandable inner transcript section should be omitted',
);
