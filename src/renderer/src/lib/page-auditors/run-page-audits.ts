import type { PageAudit, PageAuditContext, PageAuditor } from '../page-audit-types';
import { overflowAuditor } from './overflow-auditor';

const auditors: PageAuditor[] = [overflowAuditor];

export function runPageAudits(iframe: HTMLIFrameElement, context: PageAuditContext): PageAudit[] {
  const results: PageAudit[] = [];

  for (const auditor of auditors) {
    try {
      results.push(...auditor(iframe, context));
    } catch (err) {
      console.error('[page-audit] Auditor failed:', err);
    }
  }

  return results;
}
