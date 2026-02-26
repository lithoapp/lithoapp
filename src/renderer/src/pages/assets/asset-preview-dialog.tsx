import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AssetEntry } from '../../../../shared/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PreviewDialog({
  entry,
  workspaceName,
  onClose,
}: {
  entry: AssetEntry;
  workspaceName: string;
  onClose: () => void;
}): React.JSX.Element {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const assetRef = `@assets/${entry.path}`;

  function handleCopy(): void {
    navigator.clipboard.writeText(assetRef).catch(() => null);
    toast.success('Copied');
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-fit min-w-[24rem] sm:max-w-[80vw]">
        <DialogHeader>
          <DialogTitle className="truncate">{entry.name}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center rounded-lg bg-muted p-4">
          <img
            src={`litho-asset://${workspaceName}/${entry.path}`}
            alt={entry.name}
            className="max-h-96 max-w-full object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
            }}
          />
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{formatBytes(entry.size)}</span>
          {dimensions && (
            <>
              <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/50" />
              <span>
                {dimensions.w} x {dimensions.h} px
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
          <span className="flex-1 truncate">{assetRef}</span>
          <Button size="icon-sm" variant="ghost" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="h-11">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
