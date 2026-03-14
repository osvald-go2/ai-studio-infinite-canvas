export interface DiffLine {
  lineNumber: number | null;
  content: string;
  type: 'normal' | 'add' | 'remove';
}

export interface DiffRow {
  old: DiffLine | null;
  new: DiffLine | null;
}

export function parsePatchToSideBySide(patch: string): DiffRow[] {
  const lines = patch.split('\n');
  const oldLines: DiffLine[] = [];
  const newLines: DiffLine[] = [];

  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10) - 1;
        newLineNum = parseInt(match[2], 10) - 1;
      }
      continue;
    }

    if (line.startsWith('-')) {
      oldLineNum++;
      oldLines.push({ lineNumber: oldLineNum, content: line.slice(1), type: 'remove' });
    } else if (line.startsWith('+')) {
      newLineNum++;
      newLines.push({ lineNumber: newLineNum, content: line.slice(1), type: 'add' });
    } else {
      oldLineNum++;
      newLineNum++;
      const content = line.startsWith(' ') ? line.slice(1) : line;
      oldLines.push({ lineNumber: oldLineNum, content, type: 'normal' });
      newLines.push({ lineNumber: newLineNum, content, type: 'normal' });
    }
  }

  const rows: DiffRow[] = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    const o = oi < oldLines.length ? oldLines[oi] : null;
    const n = ni < newLines.length ? newLines[ni] : null;

    if (o && n && o.type === 'normal' && n.type === 'normal') {
      rows.push({ old: o, new: n });
      oi++;
      ni++;
    } else if (o && o.type === 'remove') {
      if (n && n.type === 'add') {
        rows.push({ old: o, new: n });
        oi++;
        ni++;
      } else {
        rows.push({ old: o, new: null });
        oi++;
      }
    } else if (n && n.type === 'add') {
      rows.push({ old: null, new: n });
      ni++;
    } else {
      rows.push({ old: o, new: n });
      if (o) oi++;
      if (n) ni++;
    }
  }

  return rows;
}

export function extractAddedLines(patch: string): DiffLine[] {
  const lines = patch.split('\n');
  const result: DiffLine[] = [];
  let lineNum = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) lineNum = parseInt(match[1], 10) - 1;
      continue;
    }
    if (line.startsWith('+')) {
      lineNum++;
      result.push({ lineNumber: lineNum, content: line.slice(1), type: 'add' });
    }
  }

  return result;
}

export function extractDeletedLines(patch: string): DiffLine[] {
  const lines = patch.split('\n');
  const result: DiffLine[] = [];
  let lineNum = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
      if (match) lineNum = parseInt(match[1], 10) - 1;
      continue;
    }
    if (line.startsWith('-')) {
      lineNum++;
      result.push({ lineNumber: lineNum, content: line.slice(1), type: 'remove' });
    }
  }

  return result;
}
