import {
  ArrowRight,
  FileText,
  MessageSquare,
  MousePointerClick,
  Pencil,
  Type,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import type { PendingChange } from './types';

interface PendingChangesPanelProps {
  changes: PendingChange[];
  onRemove: (id: string) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}

export function PendingChangesPanel({
  changes,
  onRemove,
  onConfirm,
  onDiscard,
}: PendingChangesPanelProps) {
  // Group by page
  const grouped = new Map<string, { pageName: string; items: PendingChange[] }>();
  for (const change of changes) {
    const existing = grouped.get(change.pageId);
    if (existing) {
      existing.items.push(change);
    } else {
      grouped.set(change.pageId, { pageName: change.pageName, items: [change] });
    }
  }

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Pencil className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Edit Mode</h2>
        {changes.length > 0 && (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            {changes.length}
          </span>
        )}
      </div>

      {/* Changes list */}
      <ScrollArea className="flex-1">
        {changes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <MousePointerClick className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Click elements to edit</p>
              <p className="text-xs text-muted-foreground">
                Click text to edit inline, or click any element and describe a change
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {[...grouped.entries()].map(([pageId, { pageName, items }]) => (
              <div key={pageId} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 px-1">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">{pageName}</p>
                </div>
                {items.map((change) => (
                  <ChangeItem key={change.id} change={change} onRemove={onRemove} />
                ))}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer actions */}
      <div className="flex gap-2 border-t p-3">
        <Button variant="outline" size="sm" className="flex-1" onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" className="flex-1" onClick={onConfirm} disabled={changes.length === 0}>
          Confirm
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ChangeItem({
  change,
  onRemove,
}: {
  change: PendingChange;
  onRemove: (id: string) => void;
}) {
  const isText = change.type === 'text';

  return (
    <div className="group flex items-start gap-0 overflow-hidden rounded-lg border border-border/60 bg-card text-sm shadow-xs">
      <div className={`w-0.5 shrink-0 self-stretch ${isText ? 'bg-primary' : 'bg-blue-500'}`} />
      <div className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2">
        <div className="mt-0.5 shrink-0">
          {isText ? (
            <Type className="h-3.5 w-3.5 text-primary" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {isText ? (
            <p className="text-xs leading-relaxed">
              <span className="rounded bg-red-500/10 px-0.5 text-red-400 line-through">
                {truncate(change.oldText, 60)}
              </span>
              <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
              <span className="rounded bg-green-500/10 px-0.5 font-medium text-green-400">
                {truncate(change.newText, 60)}
              </span>
            </p>
          ) : (
            <p className="text-xs">{truncate(change.description, 80)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(change.id)}
          className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
