import { Images, Loader2, MoreHorizontal, Pencil, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAssetUploadErrorMessage } from '@/lib/asset-upload-errors';
import { getAssetNameError, sanitizeAssetNameInput } from '../../../../shared/asset-validation';
import type { AssetEntry } from '../../../../shared/types';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

interface DocumentAssetsViewProps {
  workspaceName: string;
  docId: string;
}

export function DocumentAssetsView({
  workspaceName,
  docId,
}: DocumentAssetsViewProps): React.JSX.Element {
  const [entries, setEntries] = useState<AssetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AssetEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameError = getAssetNameError(renameValue);

  const loadEntries = useCallback(async () => {
    try {
      const result = (await window.litho.assets.listDocument(workspaceName, docId)) as AssetEntry[];
      setEntries(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceName, docId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function handleUploadFiles(files: FileList | File[]): Promise<void> {
    const toUpload: { name: string; data: Uint8Array }[] = [];
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      toUpload.push({ name: file.name, data: new Uint8Array(buf) });
    }
    try {
      await window.litho.assets.uploadDocument(workspaceName, docId, toUpload);
      await loadEntries();
      toast.success(`Uploaded ${toUpload.length} file(s)`);
    } catch (err) {
      toast.error(getAssetUploadErrorMessage(err, 'document'));
    }
  }

  async function handleDelete(fileName: string): Promise<void> {
    try {
      await window.litho.assets.deleteDocument(workspaceName, docId, fileName);
      await loadEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleRename(): Promise<void> {
    if (!renameTarget || renameError) return;
    const newName = renameTarget.ext
      ? `${sanitizeAssetNameInput(renameValue).trim()}${renameTarget.ext}`
      : sanitizeAssetNameInput(renameValue).trim();
    try {
      await window.litho.assets.renameDocument(workspaceName, docId, renameTarget.name, newName);
      await loadEntries();
      setRenameTarget(null);
      setRenameValue('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    }
  }

  function openRename(entry: AssetEntry): void {
    const nameWithoutExt = entry.ext ? entry.name.slice(0, -entry.ext.length) : entry.name;
    setRenameTarget(entry);
    setRenameValue(nameWithoutExt);
  }

  function isExternalFileDrag(e: React.DragEvent): boolean {
    return (
      e.dataTransfer.types.includes('Files') &&
      !e.dataTransfer.types.includes('application/x-litho-asset')
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone for file uploads
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragOver(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length > 0) {
          await handleUploadFiles(e.dataTransfer.files);
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleUploadFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <button
            type="button"
            className={`flex h-64 w-full max-w-lg flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/20 hover:border-muted-foreground/40'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              Drop images here or click to upload
            </span>
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <span className="flex-1 text-sm text-muted-foreground">
              {entries.length} asset{entries.length !== 1 ? 's' : ''}
            </span>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-3.5 w-3.5" />
              Upload
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 p-4">
              {entries.map((entry) => (
                <DocumentAssetCard
                  key={entry.name}
                  entry={entry}
                  workspaceName={workspaceName}
                  docId={docId}
                  onRename={() => openRename(entry)}
                  onDelete={() => setDeleteConfirm(entry.name)}
                />
              ))}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Drag overlay */}
      {entries.length > 0 && isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-primary" />
            <span className="text-sm font-medium text-primary">Drop to upload</span>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              placeholder="New name"
              value={renameValue}
              onChange={(e) => setRenameValue(sanitizeAssetNameInput(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && void handleRename()}
              className="h-11 px-4 text-base"
              autoFocus
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
            {renameTarget?.ext && (
              <span className="shrink-0 text-sm text-muted-foreground">{renameTarget.ext}</span>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="h-11">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => void handleRename()}
              disabled={Boolean(renameError)}
              className="h-11"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteConfirm}&quot;. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const name = deleteConfirm;
                setDeleteConfirm(null);
                if (name) void handleDelete(name);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DocumentAssetCard({
  entry,
  workspaceName,
  docId,
  onRename,
  onDelete,
}: {
  entry: AssetEntry;
  workspaceName: string;
  docId: string;
  onRename: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const isImage = IMAGE_EXTS.has(entry.ext);
  const src = `litho-asset://${workspaceName}/documents/${docId}/${entry.name}`;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40">
      {/* Thumbnail */}
      <div className="flex h-36 w-full items-center justify-center overflow-hidden border-b bg-muted/30">
        {isImage ? (
          <img src={src} alt={entry.name} className="h-full w-full object-contain" />
        ) : (
          <Images className="h-10 w-10 text-muted-foreground/50" />
        )}
      </div>

      {/* Context menu */}
      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon-sm" className="h-6 w-6 shadow-sm">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(entry.size)}</p>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
