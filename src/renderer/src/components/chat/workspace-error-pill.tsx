import { AlertCircle, AlertTriangle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UseWorkspaceErrorsReturn } from '@/hooks/use-workspace-errors';
import { severityOf } from '@/hooks/use-workspace-errors';
import type { WorkspaceError } from '../../../../shared/types';

function formatLabel(errorCount: number, warningCount: number): string {
  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} Error${errorCount > 1 ? 's' : ''}`);
  if (warningCount > 0) parts.push(`${warningCount} Warning${warningCount > 1 ? 's' : ''}`);
  return parts.join(' and ');
}

function formatErrorForAgent(err: WorkspaceError): string {
  const lines: string[] = [`[${err.type}] ${err.message}`];
  if (err.file) lines.push(`  File: ${err.file}`);
  if (err.route) lines.push(`  Route: ${err.route}`);
  if (err.method) lines.push(`  Method: ${err.method}`);
  if (err.url) lines.push(`  URL: ${err.url}`);
  if (err.stack) lines.push(`  Stack:\n${err.stack}`);
  return lines.join('\n');
}

export function buildErrorMessage(errors: WorkspaceError[]): string {
  const errorItems = errors.filter((e) => severityOf(e.type) === 'error');
  const warningItems = errors.filter((e) => severityOf(e.type) === 'warning');

  const sections: string[] = [];
  if (errorItems.length > 0) {
    sections.push(
      `**Errors (${errorItems.length}):**\n\`\`\`\n${errorItems.map(formatErrorForAgent).join('\n\n')}\n\`\`\``,
    );
  }
  if (warningItems.length > 0) {
    sections.push(
      `**Warnings (${warningItems.length}):**\n\`\`\`\n${warningItems.map(formatErrorForAgent).join('\n\n')}\n\`\`\``,
    );
  }

  return `The workspace server reported the following issues. Please fix them:\n\n${sections.join('\n\n')}`;
}

export function WorkspaceErrorPill({
  wsErrors,
  onSendToAgent,
}: {
  wsErrors: UseWorkspaceErrorsReturn;
  onSendToAgent: (text: string) => void;
}): React.JSX.Element | null {
  const { errors, errorCount, warningCount, hasIssues, clear } = wsErrors;

  if (!hasIssues) return null;

  const hasErrors = errorCount > 0;

  return (
    <div
      className={`flex items-center gap-2 border-t px-3 py-1.5 ${hasErrors ? 'bg-destructive/8' : 'bg-amber-500/8'}`}
    >
      <div
        className={`flex items-center gap-1.5 text-xs font-medium ${hasErrors ? 'text-destructive' : 'text-amber-500'}`}
      >
        {hasErrors ? (
          <AlertCircle className="h-3 w-3 shrink-0" />
        ) : (
          <AlertTriangle className="h-3 w-3 shrink-0" />
        )}
        <span>{formatLabel(errorCount, warningCount)}</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-2 text-xs"
        onClick={() => {
          onSendToAgent(buildErrorMessage(errors));
          clear();
        }}
      >
        <Send className="h-3 w-3" />
        Send to agent
      </Button>
    </div>
  );
}
