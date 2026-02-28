export type AuditSeverity = 'error' | 'warning';

export interface PageAuditContext {
  pageId: string;
  pageWidthPx: number;
  pageHeightPx: number;
}

export interface PageAudit {
  auditorId: string;
  severity: AuditSeverity;
  label: string;
  description: string;
  fixMessage: string;
}

export type PageAuditor = (iframe: HTMLIFrameElement, context: PageAuditContext) => PageAudit[];
