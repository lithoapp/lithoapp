import type { RenderApproach } from '../../shared/types';

/**
 * Auto-detect whether a page should use CSR or SSR based on its source.
 * Pages using DOM-dependent components (e.g. recharts' ResponsiveContainer)
 * require a browser environment and must use CSR.
 */
export function detectApproach(pageSource: string): RenderApproach {
  if (pageSource.includes('ResponsiveContainer')) return 'csr';
  return 'ssr';
}
