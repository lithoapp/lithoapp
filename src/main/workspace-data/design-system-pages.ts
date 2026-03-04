/**
 * Design system document — default pages and insertion logic.
 *
 * Standalone module (no imports from db.ts or db-backend.ts)
 * to avoid circular dependencies. Both db.ts (migrations) and
 * db-backend.ts (workspace creation) call into this module.
 */

import type Database from 'better-sqlite3';
import Mustache from 'mustache';
import defaultStylesCssRaw from './templates/default-styles.css?raw';
import dsBrandInActionRaw from './templates/ds-brand-in-action.tsx.tmpl?raw';
import dsColorsRaw from './templates/ds-colors.tsx.tmpl?raw';
import dsCoverRaw from './templates/ds-cover.tsx.tmpl?raw';
import dsRadiusShadowsRaw from './templates/ds-radius-shadows.tsx.tmpl?raw';
import dsSpacingRaw from './templates/ds-spacing.tsx.tmpl?raw';
import dsTypefacesRaw from './templates/ds-typefaces.tsx.tmpl?raw';

/** Re-export for consumers that previously imported from design-system-parser.ts */
export const DEFAULT_STYLES_CSS = defaultStylesCssRaw;

interface PageTemplate {
  name: string;
  description: string;
  source: string;
}

const PAGE_TEMPLATES: PageTemplate[] = [
  { name: 'Cover', description: 'Brand identity overview', source: dsCoverRaw },
  { name: 'Colors', description: 'Color palette and semantic swatches', source: dsColorsRaw },
  { name: 'Typography', description: 'Font families and type scale', source: dsTypefacesRaw },
  { name: 'Spacing', description: 'Spatial rhythm visualization', source: dsSpacingRaw },
  { name: 'Surfaces', description: 'Border radius and elevation', source: dsRadiusShadowsRaw },
  { name: 'Brand in Action', description: 'Design tokens in context', source: dsBrandInActionRaw },
];

/**
 * Insert the design system document and its default pages.
 *
 * Accepts `db` and `generateId` as params to avoid importing from db.ts.
 */
export function insertDesignSystemDocument(
  db: Database.Database,
  generateId: () => string,
  workspaceTitle: string,
): void {
  const docId = generateId();
  const vars = { workspaceName: workspaceTitle };

  db.prepare(
    `INSERT INTO documents (id, title, type, size_preset, size_width, size_height, size_unit)
     VALUES (?, 'Design System', 'design-system', 'A4', 210, 297, 'mm')`,
  ).run(docId);

  const insertPage = db.prepare(
    `INSERT INTO pages (id, document_id, name, description, source, position)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (let i = 0; i < PAGE_TEMPLATES.length; i++) {
    const tmpl = PAGE_TEMPLATES[i];
    const pageId = generateId();
    const renderedSource = Mustache.render(tmpl.source, vars);
    insertPage.run(pageId, docId, tmpl.name, tmpl.description, renderedSource, i + 1);
  }
}
