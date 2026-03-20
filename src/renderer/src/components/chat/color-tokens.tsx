import type { ReactNode } from 'react';
import type { DesignSystem } from '@/lib/design-system-types';
import { isValidHexColor } from '../../../../shared/color-utils';

export type ColorTokenMap = ReadonlyMap<string, string>;

const HEX_EXACT_RE = /^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i;
const COLOR_MENTION_RE =
  /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})|[a-z][a-z0-9]*(?:-[a-z0-9]+)+/gi;

export function buildColorTokenMap(designSystem: DesignSystem | null): ColorTokenMap {
  if (!designSystem) {
    return new Map();
  }

  const entries = designSystem.colors.palettes.flatMap((palette) =>
    palette.shades.flatMap((shade) => {
      if (!isValidHexColor(shade.value) || !shade.variable.startsWith('--color-')) {
        return [];
      }

      return [[shade.variable.slice('--color-'.length).toLowerCase(), shade.value] as const];
    }),
  );

  return new Map(entries);
}

export function resolveColorMention(
  mention: string,
  colorTokenMap: ColorTokenMap,
): { color: string; label: string } | null {
  const normalizedMention = mention.trim().toLowerCase();

  if (HEX_EXACT_RE.test(normalizedMention)) {
    return { color: normalizedMention, label: normalizedMention };
  }

  const color = colorTokenMap.get(normalizedMention);
  if (!color) {
    return null;
  }

  return { color, label: mention };
}

export function renderTextWithColorMentions(
  text: string,
  colorTokenMap: ColorTokenMap,
  renderColorMention: (mention: { color: string; label: string }, key: string) => ReactNode,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(COLOR_MENTION_RE)) {
    const matchedText = match[0];
    const matchIndex = match.index;

    if (matchIndex === undefined) {
      continue;
    }

    const resolvedMention = resolveColorMention(matchedText, colorTokenMap);
    if (!resolvedMention) {
      continue;
    }

    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    parts.push(renderColorMention(resolvedMention, `${matchedText}-${String(matchIndex)}`));
    lastIndex = matchIndex + matchedText.length;
  }

  if (lastIndex === 0) {
    return [text];
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
