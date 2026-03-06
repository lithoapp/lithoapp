/**
 * Design system document — template definitions and insertion logic.
 *
 * Standalone module (no imports from db.ts or db-backend.ts)
 * to avoid circular dependencies. Both db.ts (migrations) and
 * db-backend.ts (workspace creation) call into this module.
 */

import type Database from 'better-sqlite3';
import Mustache from 'mustache';

// -- Template styles (raw CSS) ------------------------------------------------

import corporateStylesRaw from './templates/corporate/styles.css?raw';
import brightsideStylesRaw from './templates/brightside/styles.css?raw';
import editorialStylesRaw from './templates/editorial/styles.css?raw';
import techStylesRaw from './templates/tech/styles.css?raw';

// -- Preview pages (thumbnail only, not inserted into workspace) --------------

import corporatePreviewRaw from './templates/corporate/preview.tsx.tmpl?raw';
import brightsidePreviewRaw from './templates/brightside/preview.tsx.tmpl?raw';
import editorialPreviewRaw from './templates/editorial/preview.tsx.tmpl?raw';
import techPreviewRaw from './templates/tech/preview.tsx.tmpl?raw';

// -- Corporate pages ----------------------------------------------------------

import corporateCoverRaw from './templates/corporate/cover.tsx.tmpl?raw';
import corporateColorsRaw from './templates/corporate/colors.tsx.tmpl?raw';
import corporateTypographyRaw from './templates/corporate/typography.tsx.tmpl?raw';
import corporateRhythmSpaceRaw from './templates/corporate/rhythm-space.tsx.tmpl?raw';
import corporateBrandInActionRaw from './templates/corporate/brand-in-action.tsx.tmpl?raw';

// -- Brightside pages ---------------------------------------------------------

import brightsideCoverRaw from './templates/brightside/cover.tsx.tmpl?raw';
import brightsidePaletteRaw from './templates/brightside/palette.tsx.tmpl?raw';
import brightsideTypeRaw from './templates/brightside/type.tsx.tmpl?raw';
import brightsideLayoutRaw from './templates/brightside/layout.tsx.tmpl?raw';
import brightsideElementsRaw from './templates/brightside/elements.tsx.tmpl?raw';

// -- Editorial pages ----------------------------------------------------------

import editorialCoverRaw from './templates/editorial/cover.tsx.tmpl?raw';
import editorialPaletteRaw from './templates/editorial/palette.tsx.tmpl?raw';
import editorialTypographyRaw from './templates/editorial/typography.tsx.tmpl?raw';
import editorialBrandStoryRaw from './templates/editorial/brand-story.tsx.tmpl?raw';
import editorialCraftPracticeRaw from './templates/editorial/craft-practice.tsx.tmpl?raw';

// -- Tech pages ---------------------------------------------------------------

import techCoverRaw from './templates/tech/cover.tsx.tmpl?raw';
import techColorsRaw from './templates/tech/colors.tsx.tmpl?raw';
import techTypographyRaw from './templates/tech/typography.tsx.tmpl?raw';
import techSpacingRaw from './templates/tech/spacing.tsx.tmpl?raw';
import techSurfacesRaw from './templates/tech/surfaces.tsx.tmpl?raw';
import techBrandInActionRaw from './templates/tech/brand-in-action.tsx.tmpl?raw';

// -- Types --------------------------------------------------------------------

export type TemplateId = 'corporate' | 'brightside' | 'editorial' | 'tech';

export const TEMPLATE_IDS: TemplateId[] = ['corporate', 'brightside', 'editorial', 'tech'];

export const DEFAULT_TEMPLATE_ID: TemplateId = 'corporate';

interface PageTemplate {
  name: string;
  description: string;
  source: string;
}

interface DesignSystemTemplate {
  styles: string;
  previewSource: string;
  pages: PageTemplate[];
}

// -- Template registry --------------------------------------------------------

const TEMPLATES: Record<TemplateId, DesignSystemTemplate> = {
  corporate: {
    styles: corporateStylesRaw,
    previewSource: corporatePreviewRaw,
    pages: [
      { name: 'Cover', description: 'Brand identity overview', source: corporateCoverRaw },
      { name: 'Colors', description: 'Color palette and semantic swatches', source: corporateColorsRaw },
      { name: 'Typography', description: 'Font families and type scale', source: corporateTypographyRaw },
      { name: 'Rhythm & Space', description: 'Spacing, radius, and elevation', source: corporateRhythmSpaceRaw },
      { name: 'Brand in Action', description: 'Design tokens in context', source: corporateBrandInActionRaw },
    ],
  },
  brightside: {
    styles: brightsideStylesRaw,
    previewSource: brightsidePreviewRaw,
    pages: [
      { name: 'Cover', description: 'Brand identity overview', source: brightsideCoverRaw },
      { name: 'Palette', description: 'Curated brand colors and expressive gradients', source: brightsidePaletteRaw },
      { name: 'Type', description: 'Modern typography pairings and hierarchy', source: brightsideTypeRaw },
      { name: 'Layout', description: 'Spacing, radius, and depth system', source: brightsideLayoutRaw },
      { name: 'Elements', description: 'Document components, icons, and chart styles', source: brightsideElementsRaw },
    ],
  },
  editorial: {
    styles: editorialStylesRaw,
    previewSource: editorialPreviewRaw,
    pages: [
      { name: 'Cover', description: 'Brand identity overview', source: editorialCoverRaw },
      { name: 'Palette', description: 'Brand colors as evocative editorial blocks', source: editorialPaletteRaw },
      { name: 'Typography', description: 'Fonts shown through editorial pairings', source: editorialTypographyRaw },
      { name: 'Brand Story', description: 'Creative philosophy and brand voice narrative', source: editorialBrandStoryRaw },
      { name: 'Craft & Practice', description: 'Details, spacing, and brand in context', source: editorialCraftPracticeRaw },
    ],
  },
  tech: {
    styles: techStylesRaw,
    previewSource: techPreviewRaw,
    pages: [
      { name: 'Cover', description: 'Brand identity overview', source: techCoverRaw },
      { name: 'Colors', description: 'Color palette and semantic swatches', source: techColorsRaw },
      { name: 'Typography', description: 'Font families and type scale', source: techTypographyRaw },
      { name: 'Spacing', description: 'Spatial rhythm visualization', source: techSpacingRaw },
      { name: 'Surfaces', description: 'Border radius and elevation', source: techSurfacesRaw },
      { name: 'Brand in Action', description: 'Live dashboard mock and design manifesto', source: techBrandInActionRaw },
    ],
  },
};

// -- Public API ---------------------------------------------------------------

/** Re-export for consumers — resolves the styles CSS for a given template. */
export const DEFAULT_STYLES_CSS = corporateStylesRaw;

export function getTemplateStyles(templateId: TemplateId): string {
  return TEMPLATES[templateId].styles;
}

export function getTemplatePreviewSource(templateId: TemplateId): string {
  return TEMPLATES[templateId].previewSource;
}

/**
 * Insert the design system document and its default pages.
 *
 * Accepts `db` and `generateId` as params to avoid importing from db.ts.
 */
export function insertDesignSystemDocument(
  db: Database.Database,
  generateId: () => string,
  workspaceTitle: string,
  templateId: TemplateId = DEFAULT_TEMPLATE_ID,
): void {
  const template = TEMPLATES[templateId];
  const docId = generateId();
  const vars = { workspaceName: workspaceTitle, currentYear: new Date().getFullYear().toString() };

  db.prepare(
    `INSERT INTO documents (id, title, type, size_preset, size_width, size_height, size_unit)
     VALUES (?, 'Design System', 'design-system', 'A4', 210, 297, 'mm')`,
  ).run(docId);

  const insertPage = db.prepare(
    `INSERT INTO pages (id, document_id, name, description, source, position)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (let i = 0; i < template.pages.length; i++) {
    const tmpl = template.pages[i];
    const pageId = generateId();
    const renderedSource = Mustache.render(tmpl.source, vars);
    insertPage.run(pageId, docId, tmpl.name, tmpl.description, renderedSource, i + 1);
  }
}
