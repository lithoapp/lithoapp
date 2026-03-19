const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function expandShortHex(hex: string): string {
  return hex
    .split('')
    .map((char) => char + char)
    .join('');
}

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

export function parseHexColorRgb(value: string): [number, number, number] {
  const hex = value.trim();
  if (!isValidHexColor(hex)) {
    throw new Error(`Invalid HEX color: "${value}"`);
  }

  const raw = hex.slice(1);
  const expanded = raw.length === 3 || raw.length === 4 ? expandShortHex(raw) : raw;

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}
