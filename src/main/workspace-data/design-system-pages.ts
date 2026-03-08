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

import brightsideStylesRaw from './templates/brightside/styles.css?raw';
import corporateStylesRaw from './templates/corporate/styles.css?raw';
import editorialStylesRaw from './templates/editorial/styles.css?raw';
import minimalStylesRaw from './templates/minimal/styles.css?raw';

// -- Preview pages (thumbnail only, not inserted into workspace) --------------

import brightsidePreviewRaw from './templates/brightside/preview.tsx.tmpl?raw';
import corporatePreviewRaw from './templates/corporate/preview.tsx.tmpl?raw';
import editorialPreviewRaw from './templates/editorial/preview.tsx.tmpl?raw';
import minimalPreviewRaw from './templates/minimal/preview.tsx.tmpl?raw';

// -- Corporate pages ----------------------------------------------------------

import corporateColorsRaw from './templates/corporate/colors.tsx.tmpl?raw';
import corporateCoverRaw from './templates/corporate/cover.tsx.tmpl?raw';
import corporateStoryRaw from './templates/corporate/story.tsx.tmpl?raw';
import corporateTypographyRaw from './templates/corporate/typography.tsx.tmpl?raw';

// -- Brightside pages ---------------------------------------------------------

import brightsideColorsRaw from './templates/brightside/colors.tsx.tmpl?raw';
import brightsideCoverRaw from './templates/brightside/cover.tsx.tmpl?raw';
import brightsideStoryRaw from './templates/brightside/story.tsx.tmpl?raw';
import brightsideTypographyRaw from './templates/brightside/typography.tsx.tmpl?raw';

// -- Editorial pages ----------------------------------------------------------

import editorialColorsRaw from './templates/editorial/colors.tsx.tmpl?raw';
import editorialCoverRaw from './templates/editorial/cover.tsx.tmpl?raw';
import editorialStoryRaw from './templates/editorial/story.tsx.tmpl?raw';
import editorialTypographyRaw from './templates/editorial/typography.tsx.tmpl?raw';

// -- Minimal pages ------------------------------------------------------------

import minimalColorsRaw from './templates/minimal/colors.tsx.tmpl?raw';
import minimalCoverRaw from './templates/minimal/cover.tsx.tmpl?raw';
import minimalStoryRaw from './templates/minimal/story.tsx.tmpl?raw';
import minimalTypographyRaw from './templates/minimal/typography.tsx.tmpl?raw';

// -- Types --------------------------------------------------------------------

export type TemplateId = 'minimal' | 'corporate' | 'brightside' | 'editorial';

export const TEMPLATE_IDS: TemplateId[] = ['minimal', 'corporate', 'brightside', 'editorial'];

export const DEFAULT_TEMPLATE_ID: TemplateId = 'minimal';

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
  minimal: {
    styles: minimalStylesRaw,
    previewSource: minimalPreviewRaw,
    pages: [
      { name: 'Cover', description: 'Brand identity overview', source: minimalCoverRaw },
      { name: 'Colors', description: 'Color palette and gradients', source: minimalColorsRaw },
      {
        name: 'Typography',
        description: 'Font families and type scale',
        source: minimalTypographyRaw,
      },
      {
        name: 'Story',
        description: 'Placeholder page for brand voice, values, and personality — empty by default, meant to be filled in',
        source: minimalStoryRaw,
      },
    ],
  },
  corporate: {
    styles: corporateStylesRaw,
    previewSource: corporatePreviewRaw,
    pages: [
      { name: 'Cover', description: 'Brand identity overview', source: corporateCoverRaw },
      { name: 'Colors', description: 'Color palette and gradients', source: corporateColorsRaw },
      {
        name: 'Typography',
        description: 'Font families and type scale',
        source: corporateTypographyRaw,
      },
      {
        name: 'Story',
        description: 'Placeholder page for brand voice, values, and personality — empty by default, meant to be filled in',
        source: corporateStoryRaw,
      },
    ],
  },
  brightside: {
    styles: brightsideStylesRaw,
    previewSource: brightsidePreviewRaw,
    pages: [
      { name: 'Cover', description: 'Brand identity overview', source: brightsideCoverRaw },
      { name: 'Colors', description: 'Color palette and gradients', source: brightsideColorsRaw },
      {
        name: 'Typography',
        description: 'Font families and type scale',
        source: brightsideTypographyRaw,
      },
      {
        name: 'Story',
        description: 'Placeholder page for brand voice, values, and personality — empty by default, meant to be filled in',
        source: brightsideStoryRaw,
      },
    ],
  },
  editorial: {
    styles: editorialStylesRaw,
    previewSource: editorialPreviewRaw,
    pages: [
      { name: 'Cover', description: 'Brand identity overview', source: editorialCoverRaw },
      { name: 'Colors', description: 'Color palette and gradients', source: editorialColorsRaw },
      {
        name: 'Typography',
        description: 'Font families and type scale',
        source: editorialTypographyRaw,
      },
      {
        name: 'Story',
        description: 'Placeholder page for brand voice, values, and personality — empty by default, meant to be filled in',
        source: editorialStoryRaw,
      },
    ],
  },
};

// -- Public API ---------------------------------------------------------------

/** Re-export for consumers — resolves the styles CSS for a given template. */
export const DEFAULT_STYLES_CSS = minimalStylesRaw;

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
