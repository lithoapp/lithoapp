import { ArrowRight, Pencil, Trash2, X } from 'lucide-react';
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
        <span className="ml-auto text-xs text-muted-foreground">
          {changes.length} {changes.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      {/* Changes list */}
      <ScrollArea className="flex-1">
        {changes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Click elements in the preview to start editing
            </p>
            <p className="text-xs text-muted-foreground/70">
              Click text to edit it directly, or click any element to describe a change
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {[...grouped.entries()].map(([pageId, { pageName, items }]) => (
              <div key={pageId} className="flex flex-col gap-1">
                <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                  {pageName}
                </p>
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
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
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
  return (
    <div className="group flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-sm">
      <div className="min-w-0 flex-1">
        {change.type === 'text' ? (
          <p className="text-xs">
            <span className="line-through text-muted-foreground">{change.oldText}</span>{' '}
            <ArrowRight className="inline h-3 w-3 text-muted-foreground" />{' '}
            <span className="font-medium">{change.newText}</span>
          </p>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground">
              {'<'}
              {change.elementInfo.tagName}
              {'>'}
            </p>
            <p className="text-xs font-medium">{change.description}</p>
          </div>
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
  );
}
