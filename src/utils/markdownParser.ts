/**
 * Lightweight markdown parser for streaming-compatible message rendering.
 * Returns an array of parsed segments that React components can render.
 */

export type MarkdownSegment =
  | { type: 'text'; html: string }
  | { type: 'code_block'; code: string; language: string };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseInline(text: string): string {
  let result = escapeHtml(text);

  // inline code (must be before bold/italic to avoid conflicts)
  result = result.replace(
    /`([^`]+)`/g,
    '<code class="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>'
  );

  // bold
  result = result.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="text-white font-semibold">$1</strong>'
  );

  // italic
  result = result.replace(
    /\*(.+?)\*/g,
    '<em class="text-gray-400">$1</em>'
  );

  return result;
}

function parseBlock(lines: string[]): string {
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = parseInline(headingMatch[2]);
      const sizeClass = level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-[15px]';
      htmlParts.push(`<h${level} class="text-white font-medium ${sizeClass}">${text}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      htmlParts.push(
        `<div class="border-l-2 border-white/10 pl-4 py-1 text-gray-400 italic text-sm">${quoteLines.map(l => parseInline(l)).join('<br/>')}</div>`
      );
      continue;
    }

    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push(parseInline(lines[i].replace(/^[-*]\s+/, '')));
        i++;
      }
      htmlParts.push(
        `<ul class="space-y-1.5 list-disc list-inside marker:text-gray-500">${items.map(item => `<li>${item}</li>`).join('')}</ul>`
      );
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        items.push(parseInline(lines[i].replace(/^\d+\.\s+/, '')));
        i++;
      }
      htmlParts.push(
        `<ol class="list-decimal list-inside space-y-1.5 marker:text-gray-500">${items.map(item => `<li>${item}</li>`).join('')}</ol>`
      );
      continue;
    }

    // Empty line → spacing
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    htmlParts.push(`<p>${parseInline(line)}</p>`);
    i++;
  }

  return htmlParts.join('');
}

export function parseMarkdown(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      const lines = textBefore.split('\n');
      const html = parseBlock(lines);
      if (html) {
        segments.push({ type: 'text', html });
      }
    }

    // Code block
    segments.push({
      type: 'code_block',
      language: match[1] || 'text',
      code: match[2].replace(/\n$/, ''),
    });

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    // Check for unclosed code block (streaming)
    const unclosedMatch = remaining.match(/```(\w*)\n([\s\S]*)$/);
    if (unclosedMatch) {
      const textBefore = remaining.slice(0, remaining.indexOf('```'));
      if (textBefore.trim()) {
        const html = parseBlock(textBefore.split('\n'));
        if (html) {
          segments.push({ type: 'text', html });
        }
      }
      // Render unclosed code block as code (streaming state)
      segments.push({
        type: 'code_block',
        language: unclosedMatch[1] || 'text',
        code: unclosedMatch[2],
      });
    } else {
      const html = parseBlock(remaining.split('\n'));
      if (html) {
        segments.push({ type: 'text', html });
      }
    }
  }

  return segments;
}
