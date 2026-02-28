/**
 * Design system CSS parser & serializer.
 */

import type {
  ColorPalette,
  DesignSystem,
  DesignSystemToken,
  TokenCategory,
  TokenControl,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface RawToken {
  variable: string;
  value: string;
}

interface ParseError {
  lineNumber: number;
  content: string;
}

export interface ParsedTheme {
  prefix: string;
  suffix: string;
  rawTokens: RawToken[];
  fonts: string[];
  errors: ParseError[];
}

// ---------------------------------------------------------------------------
// parseThemeBlock — extracts @theme block from CSS
// ---------------------------------------------------------------------------

const TOKEN_REGEX = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*;/;
const IMPORT_URL_REGEX = /@import\s+url\(\s*['"]([^'"]+)['"]\s*\)/g;

export function parseThemeBlock(css: string): ParsedTheme {
  const themeStart = css.indexOf('@theme');
  if (themeStart === -1) {
    return { prefix: css, suffix: '', rawTokens: [], fonts: [], errors: [] };
  }

  const openBrace = css.indexOf('{', themeStart);
  if (openBrace === -1) {
    return { prefix: css, suffix: '', rawTokens: [], fonts: [], errors: [] };
  }

  let depth = 1;
  let pos = openBrace + 1;
  while (pos < css.length && depth > 0) {
    if (css[pos] === '{') depth++;
    else if (css[pos] === '}') depth--;
    pos++;
  }

  const closeBrace = pos - 1;
  const prefix = css.slice(0, themeStart);
  const suffix = css.slice(closeBrace + 1);
  const themeBody = css.slice(openBrace + 1, closeBrace);

  const lineOfOpenBrace = css.slice(0, openBrace + 1).split('\n').length;

  const rawTokens: RawToken[] = [];
  const errors: ParseError[] = [];
  const themeBodyLines = themeBody.split('\n');
  for (let i = 0; i < themeBodyLines.length; i++) {
    const line = themeBodyLines[i];
    const match = line.match(TOKEN_REGEX);
    if (match) {
      rawTokens.push({ variable: match[1], value: match[2] });
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    errors.push({ lineNumber: lineOfOpenBrace + i, content: line.trimEnd() });
  }

  const fonts: string[] = [];
  for (const fontMatch of prefix.matchAll(IMPORT_URL_REGEX)) {
    fonts.push(fontMatch[1]);
  }

  return { prefix, suffix, rawTokens, fonts, errors };
}

// ---------------------------------------------------------------------------
// categorizeTokens — converts raw tokens into the DesignSystem structure
// ---------------------------------------------------------------------------

interface CategoryRule {
  pattern: RegExp;
  category: TokenCategory;
  control: TokenControl;
  group: (match: RegExpMatchArray) => string;
  label: (match: RegExpMatchArray) => string;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    pattern: /^--color-([a-z][\w-]*?)-(\d+)$/,
    category: 'color',
    control: 'color',
    group: (m) => m[1],
    label: (m) => m[2],
  },
  {
    pattern: /^--color-([a-z][a-z0-9]*)(?:-(.+))?$/,
    category: 'color',
    control: 'color',
    group: (m) => m[1],
    label: (m) => (m[2] ? formatLabel(m[2]) : 'Default'),
  },
  {
    pattern: /^--font-weight-(.+)$/,
    category: 'font-weight',
    control: 'number',
    group: () => 'weights',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--font-(.+)$/,
    category: 'font-family',
    control: 'font-stack',
    group: () => 'families',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--text-(.+)--line-height$/,
    category: 'font-size',
    control: 'text',
    group: () => 'sizes',
    label: (m) => `${formatLabel(m[1])} Line Height`,
  },
  {
    pattern: /^--text-(.+)$/,
    category: 'font-size',
    control: 'text',
    group: () => 'sizes',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--tracking-(.+)$/,
    category: 'tracking',
    control: 'text',
    group: () => 'tracking',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--leading-(.+)$/,
    category: 'leading',
    control: 'number',
    group: () => 'leading',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--spacing-(.+)$/,
    category: 'spacing',
    control: 'text',
    group: () => 'spacing',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--radius-(.+)$/,
    category: 'radius',
    control: 'text',
    group: () => 'radius',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--shadow-(.+)$/,
    category: 'shadow',
    control: 'shadow',
    group: () => 'shadows',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--gradient-(.+)$/,
    category: 'gradient',
    control: 'text',
    group: () => 'gradients',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--ease-(.+)$/,
    category: 'transition',
    control: 'text',
    group: () => 'transitions',
    label: (m) => formatLabel(m[1]),
  },
  {
    pattern: /^--z-(.+)$/,
    category: 'z-index',
    control: 'number',
    group: () => 'z-index',
    label: (m) => formatLabel(m[1]),
  },
];

function formatLabel(raw: string): string {
  return raw
    .replace(/_/g, '.')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function categorizeToken(raw: RawToken): DesignSystemToken {
  for (const rule of CATEGORY_RULES) {
    const match = raw.variable.match(rule.pattern);
    if (match) {
      return {
        variable: raw.variable,
        value: raw.value,
        category: rule.category,
        control: rule.control,
        label: rule.label(match),
        group: rule.group(match),
      };
    }
  }

  return {
    variable: raw.variable,
    value: raw.value,
    category: 'z-index',
    control: 'text',
    label: raw.variable,
    group: 'unknown',
  };
}

export function categorizeTokens(rawTokens: RawToken[], fonts: string[]): DesignSystem {
  const tokens = rawTokens.map(categorizeToken);

  const colorTokens = tokens.filter((t) => t.category === 'color');
  const paletteMap = new Map<string, DesignSystemToken[]>();

  for (const token of colorTokens) {
    const existing = paletteMap.get(token.group);
    if (existing) {
      existing.push(token);
    } else {
      paletteMap.set(token.group, [token]);
    }
  }

  const palettes: ColorPalette[] = [...paletteMap.entries()].map(([name, shades]) => ({
    name,
    shades,
  }));

  const byCategory = (cat: TokenCategory): DesignSystemToken[] =>
    tokens.filter((t) => t.category === cat);

  return {
    colors: { palettes },
    typography: {
      families: byCategory('font-family'),
      sizes: byCategory('font-size'),
      weights: byCategory('font-weight'),
      tracking: byCategory('tracking'),
      leading: byCategory('leading'),
    },
    spacing: byCategory('spacing'),
    radius: byCategory('radius'),
    shadows: byCategory('shadow'),
    gradients: byCategory('gradient'),
    transitions: byCategory('transition'),
    zIndex: byCategory('z-index'),
    fonts,
  };
}

// ---------------------------------------------------------------------------
// applyUpdates — applies variable value changes to raw tokens
// ---------------------------------------------------------------------------

export function applyUpdates(
  tokens: RawToken[],
  updates: Array<{ variable: string; value: string }>,
): RawToken[] {
  const updateMap = new Map(updates.map((u) => [u.variable, u.value]));

  return tokens.map((token) => {
    const newValue = updateMap.get(token.variable);
    if (newValue !== undefined) {
      return { ...token, value: newValue };
    }
    return token;
  });
}

// ---------------------------------------------------------------------------
// serializeFullCss — rebuilds CSS from parsed theme + updated tokens
// ---------------------------------------------------------------------------

const SECTION_ORDER: Array<{ prefix: string; comment: string }> = [
  { prefix: '--color-', comment: 'Colors' },
  { prefix: '--font-', comment: 'Typography — Font families & weights' },
  { prefix: '--text-', comment: 'Typography — Font sizes' },
  { prefix: '--tracking-', comment: 'Typography — Tracking' },
  { prefix: '--leading-', comment: 'Typography — Leading' },
  { prefix: '--spacing-', comment: 'Spacing' },
  { prefix: '--radius-', comment: 'Border radius' },
  { prefix: '--shadow-', comment: 'Shadows' },
  { prefix: '--ease-', comment: 'Transitions' },
  { prefix: '--z-', comment: 'Z-index scale' },
];

function serializeThemeBlock(tokens: RawToken[]): string {
  const remaining = [...tokens];
  const groups: Array<{ comment: string; tokens: RawToken[] }> = [];

  for (const section of SECTION_ORDER) {
    const matching: RawToken[] = [];
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (remaining[i].variable.startsWith(section.prefix)) {
        matching.unshift(remaining[i]);
        remaining.splice(i, 1);
      }
    }
    if (matching.length > 0) {
      groups.push({ comment: section.comment, tokens: matching });
    }
  }

  if (remaining.length > 0) {
    groups.push({ comment: 'Other', tokens: remaining });
  }

  const lines: string[] = ['@theme {'];
  for (const group of groups) {
    lines.push('');
    lines.push(`  /* ${group.comment} */`);
    for (const token of group.tokens) {
      lines.push(`  ${token.variable}: ${token.value};`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}

export function serializeFullCss(parsed: ParsedTheme, tokens: RawToken[]): string {
  const themeBlock = serializeThemeBlock(tokens);
  return `${parsed.prefix}${themeBlock}${parsed.suffix}`;
}

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Default page template
// ---------------------------------------------------------------------------

export function defaultPageContent(pageName: string): string {
  const funcName = pageName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  return `import '@styles.css';

export default function ${funcName}() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-12">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900">${pageName}</h1>
    </div>
  );
}
`;
}

// ---------------------------------------------------------------------------
// DEFAULT_STYLES_CSS — re-exported from design-system-pages.ts
// ---------------------------------------------------------------------------

export { DEFAULT_STYLES_CSS } from './design-system-pages';
