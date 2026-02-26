/**
 * Design system CSS parser & serializer.
 *
 * Copied from @kareemaly/litho-workspace-server/src/design-system/
 * so the app no longer depends on the server package for this logic.
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
// DEFAULT_STYLES_CSS — the default styles.css for new workspaces
// ---------------------------------------------------------------------------

export const DEFAULT_STYLES_CSS = `@import "tailwindcss";

/* ============================================================
   Google Fonts
   ============================================================ */
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');

/* ============================================================
   Design System — Tailwind v4
   ============================================================ */
@theme {

  /* Colors */

  /* Neutral — Stone (warm gray, professional) */
  --color-neutral-50: #fafaf9;
  --color-neutral-100: #f5f5f4;
  --color-neutral-200: #e7e5e4;
  --color-neutral-300: #d6d3d1;
  --color-neutral-400: #a8a29e;
  --color-neutral-500: #78716c;
  --color-neutral-600: #57534e;
  --color-neutral-700: #44403c;
  --color-neutral-800: #292524;
  --color-neutral-900: #1c1917;
  --color-neutral-950: #0c0a09;

  /* Primary — Indigo (corporate, trustworthy) */
  --color-primary-50: #eef2ff;
  --color-primary-100: #e0e7ff;
  --color-primary-200: #c7d2fe;
  --color-primary-300: #a5b4fc;
  --color-primary-400: #818cf8;
  --color-primary-500: #6366f1;
  --color-primary-600: #4f46e5;
  --color-primary-700: #4338ca;
  --color-primary-800: #3730a3;
  --color-primary-900: #312e81;
  --color-primary-950: #1e1b4b;

  /* Secondary — Slate (cool supporting neutral) */
  --color-secondary-50: #f8fafc;
  --color-secondary-100: #f1f5f9;
  --color-secondary-200: #e2e8f0;
  --color-secondary-300: #cbd5e1;
  --color-secondary-400: #94a3b8;
  --color-secondary-500: #64748b;
  --color-secondary-600: #475569;
  --color-secondary-700: #334155;
  --color-secondary-800: #1e293b;
  --color-secondary-900: #0f172a;
  --color-secondary-950: #020617;

  /* Accent — Orange (energetic warm contrast) */
  --color-accent-50: #fff7ed;
  --color-accent-100: #ffedd5;
  --color-accent-200: #fed7aa;
  --color-accent-300: #fdba74;
  --color-accent-400: #fb923c;
  --color-accent-500: #f97316;
  --color-accent-600: #ea580c;
  --color-accent-700: #c2410c;
  --color-accent-800: #9a3412;
  --color-accent-900: #7c2d12;
  --color-accent-950: #431407;

  /* Success — Emerald */
  --color-success-50: #ecfdf5;
  --color-success-100: #d1fae5;
  --color-success-200: #a7f3d0;
  --color-success-300: #6ee7b7;
  --color-success-400: #34d399;
  --color-success-500: #10b981;
  --color-success-600: #059669;
  --color-success-700: #047857;
  --color-success-800: #065f46;
  --color-success-900: #064e3b;
  --color-success-950: #022c22;

  /* Warning — Amber */
  --color-warning-50: #fffbeb;
  --color-warning-100: #fef3c7;
  --color-warning-200: #fde68a;
  --color-warning-300: #fcd34d;
  --color-warning-400: #fbbf24;
  --color-warning-500: #f59e0b;
  --color-warning-600: #d97706;
  --color-warning-700: #b45309;
  --color-warning-800: #92400e;
  --color-warning-900: #78350f;
  --color-warning-950: #451a03;

  /* Error — Rose */
  --color-error-50: #fff1f2;
  --color-error-100: #ffe4e6;
  --color-error-200: #fecdd3;
  --color-error-300: #fda4af;
  --color-error-400: #fb7185;
  --color-error-500: #f43f5e;
  --color-error-600: #e11d48;
  --color-error-700: #be123c;
  --color-error-800: #9f1239;
  --color-error-900: #881337;
  --color-error-950: #4c0519;

  /* Info — Sky */
  --color-info-50: #f0f9ff;
  --color-info-100: #e0f2fe;
  --color-info-200: #bae6fd;
  --color-info-300: #7dd3fc;
  --color-info-400: #38bdf8;
  --color-info-500: #0ea5e9;
  --color-info-600: #0284c7;
  --color-info-700: #0369a1;
  --color-info-800: #075985;
  --color-info-900: #0c4a6e;
  --color-info-950: #082f49;

  /* Typography — Font families & weights */
  --font-weight-thin: 100;
  --font-weight-extralight: 200;
  --font-weight-light: 300;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-extrabold: 800;
  --font-weight-black: 900;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-display: 'Fraunces', Georgia, serif;
  --font-serif: 'Playfair Display', Georgia, serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Typography — Font sizes */
  --text-xs: 0.75rem;
  --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.25rem;
  --text-base: 1rem;
  --text-base--line-height: 1.5rem;
  --text-lg: 1.125rem;
  --text-lg--line-height: 1.75rem;
  --text-xl: 1.25rem;
  --text-xl--line-height: 1.75rem;
  --text-2xl: 1.5rem;
  --text-2xl--line-height: 2rem;
  --text-3xl: 1.875rem;
  --text-3xl--line-height: 2.25rem;
  --text-4xl: 2.25rem;
  --text-4xl--line-height: 2.5rem;
  --text-5xl: 3rem;
  --text-5xl--line-height: 1.15;
  --text-6xl: 3.75rem;
  --text-6xl--line-height: 1.1;
  --text-7xl: 4.5rem;
  --text-7xl--line-height: 1.05;

  /* Typography — Tracking */
  --tracking-tighter: -0.05em;
  --tracking-tight: -0.025em;
  --tracking-normal: 0em;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;
  --tracking-widest: 0.1em;

  /* Typography — Leading */
  --leading-none: 1;
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  --leading-loose: 2;

  /* Spacing */
  --spacing-px: 1px;
  --spacing-0: 0;
  --spacing-0_5: 0.125rem;
  --spacing-1: 0.25rem;
  --spacing-1_5: 0.375rem;
  --spacing-2: 0.5rem;
  --spacing-2_5: 0.625rem;
  --spacing-3: 0.75rem;
  --spacing-3_5: 0.875rem;
  --spacing-4: 1rem;
  --spacing-5: 1.25rem;
  --spacing-6: 1.5rem;
  --spacing-7: 1.75rem;
  --spacing-8: 2rem;
  --spacing-9: 2.25rem;
  --spacing-10: 2.5rem;
  --spacing-11: 2.75rem;
  --spacing-12: 3rem;
  --spacing-14: 3.5rem;
  --spacing-16: 4rem;
  --spacing-20: 5rem;
  --spacing-24: 6rem;
  --spacing-28: 7rem;
  --spacing-32: 8rem;
  --spacing-36: 9rem;
  --spacing-40: 10rem;
  --spacing-44: 11rem;
  --spacing-48: 12rem;
  --spacing-52: 13rem;
  --spacing-56: 14rem;
  --spacing-60: 15rem;
  --spacing-64: 16rem;

  /* Border radius */
  --radius-none: 0;
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-2xl: 1rem;
  --radius-3xl: 1.5rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-DEFAULT: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  --shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);

}
`;
