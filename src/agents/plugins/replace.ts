// String replacement engine ported from OpenCode's edit tool.
// Implements a 9-level fallback chain of "replacers" that handle common
// mismatches (whitespace, indentation, escape sequences, fuzzy anchors).
//
// Sources:
// - https://github.com/cline/cline/blob/main/evals/diff-edits/diff-apply/diff-06-23-25.ts
// - https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/editCorrector.ts

type Replacer = (content: string, find: string) => Generator<string, void, unknown>;

// ─── Similarity thresholds for block anchor matching ────────────────────────

const SINGLE_CANDIDATE_THRESHOLD = 0.0;
const MULTIPLE_CANDIDATES_THRESHOLD = 0.3;

// ─── Levenshtein distance ───────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === '' || b === '') return Math.max(a.length, b.length);

  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

// ─── 1. Exact match ────────────────────────────────────────────────────────

const simpleReplacer: Replacer = function* (_content, find) {
  yield find;
};

// ─── 2. Line-trimmed match ──────────────────────────────────────────────────

const lineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split('\n');
  const searchLines = find.split('\n');

  if (searchLines[searchLines.length - 1] === '') searchLines.pop();

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false;
        break;
      }
    }

    if (matches) {
      let startIdx = 0;
      for (let k = 0; k < i; k++) startIdx += originalLines[k].length + 1;

      let endIdx = startIdx;
      for (let k = 0; k < searchLines.length; k++) {
        endIdx += originalLines[i + k].length;
        if (k < searchLines.length - 1) endIdx += 1;
      }

      yield content.substring(startIdx, endIdx);
    }
  }
};

// ─── 3. Block anchor match (first/last line anchors + Levenshtein) ──────────

const blockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split('\n');
  const searchLines = find.split('\n');

  if (searchLines.length < 3) return;
  if (searchLines[searchLines.length - 1] === '') searchLines.pop();

  const firstLineSearch = searchLines[0].trim();
  const lastLineSearch = searchLines[searchLines.length - 1].trim();
  const searchBlockSize = searchLines.length;

  const candidates: Array<{ startLine: number; endLine: number }> = [];
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) continue;
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        candidates.push({ startLine: i, endLine: j });
        break;
      }
    }
  }

  if (candidates.length === 0) return;

  function extractBlock(startLine: number, endLine: number): string {
    let startIdx = 0;
    for (let k = 0; k < startLine; k++) startIdx += originalLines[k].length + 1;
    let endIdx = startIdx;
    for (let k = startLine; k <= endLine; k++) {
      endIdx += originalLines[k].length;
      if (k < endLine) endIdx += 1;
    }
    return content.substring(startIdx, endIdx);
  }

  function scoreSimilarity(startLine: number, endLine: number): number {
    const actualBlockSize = endLine - startLine + 1;
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2);

    if (linesToCheck <= 0) return 1.0;

    let similarity = 0;
    for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
      const originalLine = originalLines[startLine + j].trim();
      const searchLine = searchLines[j].trim();
      const maxLen = Math.max(originalLine.length, searchLine.length);
      if (maxLen === 0) continue;
      const distance = levenshtein(originalLine, searchLine);
      similarity += (1 - distance / maxLen) / linesToCheck;
    }
    return similarity;
  }

  if (candidates.length === 1) {
    const { startLine, endLine } = candidates[0];
    if (scoreSimilarity(startLine, endLine) >= SINGLE_CANDIDATE_THRESHOLD) {
      yield extractBlock(startLine, endLine);
    }
    return;
  }

  let bestMatch: (typeof candidates)[0] | null = null;
  let maxSimilarity = -1;

  for (const candidate of candidates) {
    const similarity = scoreSimilarity(candidate.startLine, candidate.endLine);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = candidate;
    }
  }

  if (maxSimilarity >= MULTIPLE_CANDIDATES_THRESHOLD && bestMatch) {
    yield extractBlock(bestMatch.startLine, bestMatch.endLine);
  }
};

// ─── 4. Whitespace-normalized match ─────────────────────────────────────────

const whitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  const normalizedFind = normalize(find);

  const lines = content.split('\n');
  for (const line of lines) {
    if (normalize(line) === normalizedFind) {
      yield line;
    } else {
      const normalizedLine = normalize(line);
      if (normalizedLine.includes(normalizedFind)) {
        const words = find.trim().split(/\s+/);
        if (words.length > 0) {
          const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
          try {
            const match = line.match(new RegExp(pattern));
            if (match) yield match[0];
          } catch {
            // Invalid regex, skip
          }
        }
      }
    }
  }

  const findLines = find.split('\n');
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length);
      if (normalize(block.join('\n')) === normalizedFind) {
        yield block.join('\n');
      }
    }
  }
};

// ─── 5. Indentation-flexible match ──────────────────────────────────────────

const indentationFlexibleReplacer: Replacer = function* (content, find) {
  function removeIndentation(text: string): string {
    const lines = text.split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    if (nonEmpty.length === 0) return text;

    const minIndent = Math.min(
      ...nonEmpty.map((l) => {
        const m = l.match(/^(\s*)/);
        return m ? m[1].length : 0;
      }),
    );

    return lines.map((l) => (l.trim().length === 0 ? l : l.slice(minIndent))).join('\n');
  }

  const normalizedFind = removeIndentation(find);
  const contentLines = content.split('\n');
  const findLines = find.split('\n');

  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join('\n');
    if (removeIndentation(block) === normalizedFind) {
      yield block;
    }
  }
};

// ─── 6. Escape-normalized match ─────────────────────────────────────────────

const escapeNormalizedReplacer: Replacer = function* (content, find) {
  function unescapeStr(str: string): string {
    return str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, ch) => {
      const map: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        "'": "'",
        '"': '"',
        '`': '`',
        '\\': '\\',
        '\n': '\n',
        $: '$',
      };
      return map[ch] ?? match;
    });
  }

  const unescapedFind = unescapeStr(find);

  if (content.includes(unescapedFind)) {
    yield unescapedFind;
  }

  const lines = content.split('\n');
  const findLines = unescapedFind.split('\n');

  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join('\n');
    if (unescapeStr(block) === unescapedFind) {
      yield block;
    }
  }
};

// ─── 7. Trimmed-boundary match ──────────────────────────────────────────────

const trimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmed = find.trim();
  if (trimmed === find) return;

  if (content.includes(trimmed)) {
    yield trimmed;
  }

  const lines = content.split('\n');
  const findLines = find.split('\n');

  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join('\n');
    if (block.trim() === trimmed) {
      yield block;
    }
  }
};

// ─── 8. Context-aware match (anchor + 50% middle similarity) ────────────────

const contextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split('\n');
  if (findLines.length < 3) return;
  if (findLines[findLines.length - 1] === '') findLines.pop();

  const contentLines = content.split('\n');
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;

    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() !== lastLine) continue;

      const blockLines = contentLines.slice(i, j + 1);
      if (blockLines.length !== findLines.length) break;

      let matching = 0;
      let total = 0;

      for (let k = 1; k < blockLines.length - 1; k++) {
        const bl = blockLines[k].trim();
        const fl = findLines[k].trim();
        if (bl.length > 0 || fl.length > 0) {
          total++;
          if (bl === fl) matching++;
        }
      }

      if (total === 0 || matching / total >= 0.5) {
        yield blockLines.join('\n');
      }
      break;
    }
  }
};

// ─── 9. Multi-occurrence (yields all exact matches) ─────────────────────────

const multiOccurrenceReplacer: Replacer = function* (content, find) {
  let startIndex = 0;
  while (true) {
    const index = content.indexOf(find, startIndex);
    if (index === -1) break;
    yield find;
    startIndex = index + find.length;
  }
};

// ─── Replacer chain ─────────────────────────────────────────────────────────

const replacers: Replacer[] = [
  simpleReplacer,
  lineTrimmedReplacer,
  blockAnchorReplacer,
  whitespaceNormalizedReplacer,
  indentationFlexibleReplacer,
  escapeNormalizedReplacer,
  trimmedBoundaryReplacer,
  contextAwareReplacer,
  multiOccurrenceReplacer,
];

// ─── Public API ─────────────────────────────────────────────────────────────

export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): string {
  if (oldString === newString) {
    throw new Error('oldString and newString are identical — no changes to apply.');
  }

  let notFound = true;

  for (const replacer of replacers) {
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search);
      if (index === -1) continue;

      notFound = false;

      if (replaceAll) {
        return content.replaceAll(search, newString);
      }

      const lastIndex = content.lastIndexOf(search);
      if (index !== lastIndex) continue;

      return content.substring(0, index) + newString + content.substring(index + search.length);
    }
  }

  if (notFound) {
    throw new Error(
      'Could not find oldString in the file. ' +
        'It must match exactly, including whitespace, indentation, and line endings.',
    );
  }

  throw new Error(
    'Found multiple matches for oldString. ' +
      'Provide more surrounding context to make the match unique.',
  );
}
