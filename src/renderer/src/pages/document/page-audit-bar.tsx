import { AlertTriangle, CircleAlert, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div
      className="flex flex-col gap-1 rounded-b-lg border border-t-0 bg-red-950/80 px-2.5 py-1.5"
      style={{ width: displayWidth }}
    >
      {audits.map((audit) => (
        <div key={audit.auditorId} className="flex items-center gap-2">
          {audit.severity === 'error' ? (
            <CircleAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-red-200">{audit.label}</div>
            <div className="truncate text-xs text-red-300/70">{audit.description}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-red-200 hover:bg-red-900/60 hover:text-red-100"
            disabled={isAgentBusy}
            onClick={() => onFix(audit)}
          >
            <Send className="h-3 w-3" />
            Ask agent to fix
          </Button>
        </div>
      ))}
    </div>
  );
}
