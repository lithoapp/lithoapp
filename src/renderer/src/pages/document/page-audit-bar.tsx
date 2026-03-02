import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { PageAudit } from '@/lib/page-audit-types';

interface PageAuditBarProps {
  audits: PageAudit[];
  displayWidth: number;
  isAgentBusy: boolean;
  onFix: (audit: PageAudit) => void;
}

export function PageAuditBar({
  audits,
  displayWidth,
  isAgentBusy,
  onFix,
}: PageAuditBarProps): React.JSX.Element | null {
  if (audits.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1.5 pt-2" style={{ width: displayWidth }}>
      {audits.map((audit) => (
        <button
          key={audit.auditorId}
          type="button"
          disabled={isAgentBusy}
          onClick={() => onFix(audit)}
          title="Ask agent to fix"
          className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/25 disabled:opacity-50 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{audit.label}</span>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      ))}
    </div>
  );
}
