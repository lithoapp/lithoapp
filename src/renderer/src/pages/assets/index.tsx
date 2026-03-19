import { ChevronLeft, FolderPlus, Images, Loader2, Trash2, Upload } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { getAssetNameError, sanitizeAssetNameInput } from '../../../../shared/asset-validation';
import type { AssetEntry } from '../../../../shared/types';
import { AssetGridItem, IMAGE_EXTS } from './asset-grid-item';
import { PreviewDialog } from './asset-preview-dialog';

interface AssetsPageProps {
  workspaceName: string;
  onBack: () => void;
}

export function AssetsPage({ workspaceName, onBack }: AssetsPageProps): React.JSX.Element {
  const [currentDir, setCurrentDir] = useState('');
  const [entries, setEntries] = useState<AssetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renameTarget, setRenameTarget] = useState<AssetEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [hasTouchedNewFolderName, setHasTouchedNewFolderName] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<AssetEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeletePaths, setBulkDeletePaths] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderError = hasTouchedNewFolderName ? getAssetNameError(newFolderName) : null;
  const renameError = getAssetNameError(renameValue);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await window.litho.assets.list(workspaceName, currentDir, false);
      // At root level, hide the reserved "documents" folder (per-document assets)
      const filtered =
        currentDir === ''
          ? raw.filter((e) => !(e.type === 'directory' && e.name === 'documents'))
          : raw;
      const sorted = [...filtered].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceName, currentDir]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Reset selection when directory changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentDir is the intentional trigger
  useEffect(() => {
    setSelected(new Set());
  }, [currentDir]);

  async function handleUploadFiles(files: FileList | File[]): Promise<void> {
    const fileArray = Array.from(files);
    const toUpload: { name: string; data: Uint8Array }[] = [];

    for (const file of fileArray) {
      const buf = await file.arrayBuffer();
      toUpload.push({ name: file.name, data: new Uint8Array(buf) });
    }

    try {
      await window.litho.assets.upload(workspaceName, currentDir, toUpload);
      await loadEntries();
      toast.success(`Uploaded ${toUpload.length} file(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  function isExternalFileDrag(e: React.DragEvent): boolean {
    return (
      e.dataTransfer.types.includes('Files') &&
      !e.dataTransfer.types.includes('application/x-litho-asset')
    );
  }

  function handleDragOver(e: React.DragEvent): void {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent): void {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  async function handleDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await handleUploadFiles(e.dataTransfer.files);
    }
  }

  async function handleCreateFolder(): Promise<void> {
    const folderName = sanitizeAssetNameInput(newFolderName).trim();
    const folderError = getAssetNameError(folderName);
    setHasTouchedNewFolderName(true);
    if (folderError) return;
    const dirPath = currentDir ? `${currentDir}/${folderName}` : folderName;
    try {
      await window.litho.assets.createDirectory(workspaceName, dirPath);
      await loadEntries();
      setNewFolderOpen(false);
      setNewFolderName('');
      setHasTouchedNewFolderName(false);
      toast.success(`Created folder "${folderName}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create folder');
    }
  }

  async function handleDelete(entryPath: string): Promise<void> {
    try {
      await window.litho.assets.delete(workspaceName, entryPath);
      await loadEntries();
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(entryPath);
        return next;
      });
      toast.success('Deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleBulkDelete(): Promise<void> {
    const paths = bulkDeletePaths;
    setBulkDeleteConfirm(false);
    for (const p of paths) {
      try {
        await window.litho.assets.delete(workspaceName, p);
      } catch (err) {
        toast.error(`Failed to delete "${p}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await loadEntries();
    setSelected(new Set());
    setBulkDeletePaths([]);
    toast.success(`Deleted ${paths.length} item(s)`);
  }

  async function handleMoveToFolder(assetPath: string, folderPath: string): Promise<void> {
    const fileName = assetPath.split('/').pop() ?? '';
    const newPath = `${folderPath}/${fileName}`;
    try {
      await window.litho.assets.rename(workspaceName, assetPath, newPath);
      await loadEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move asset');
    }
  }

  async function handleMoveToParent(assetPath: string): Promise<void> {
    if (!currentDir) return;
    const fileName = assetPath.split('/').pop() ?? '';
    const parentDir = currentDir.includes('/')
      ? currentDir.substring(0, currentDir.lastIndexOf('/'))
      : '';
    const newPath = parentDir ? `${parentDir}/${fileName}` : fileName;
    try {
      await window.litho.assets.rename(workspaceName, assetPath, newPath);
      await loadEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move asset');
    }
  }

  const [isBackDragOver, setIsBackDragOver] = useState(false);

  async function handleRename(): Promise<void> {
    if (!renameTarget || renameError) return;
    const newName = renameTarget.ext
      ? `${sanitizeAssetNameInput(renameValue).trim()}${renameTarget.ext}`
      : sanitizeAssetNameInput(renameValue).trim();
    const parentDir = renameTarget.path.includes('/')
      ? renameTarget.path.substring(0, renameTarget.path.lastIndexOf('/'))
      : '';
    const newPath = parentDir ? `${parentDir}/${newName}` : newName;
    try {
      await window.litho.assets.rename(workspaceName, renameTarget.path, newPath);
      await loadEntries();
      setRenameTarget(null);
      setRenameValue('');
      toast.success('Renamed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    }
  }

  function toggleSelect(path: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  const folderName = currentDir ? currentDir.split('/').pop() : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop drop zone
    <div
      className={`flex h-full flex-col gap-6 overflow-auto p-6 ${isDragOver ? 'ring-2 ring-primary ring-inset rounded-lg' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-end justify-between">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target for moving assets out of folder */}
        <div
          className={`flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors ${isBackDragOver ? 'bg-primary/10 ring-2 ring-primary/30' : ''}`}
          onDragOver={(e) => {
            if (!currentDir) return;
            if (!e.dataTransfer.types.includes('application/x-litho-asset')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setIsBackDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsBackDragOver(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsBackDragOver(false);
            const assetPath = e.dataTransfer.getData('application/x-litho-asset');
            if (assetPath) void handleMoveToParent(assetPath);
          }}
        >
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted"
            onClick={currentDir ? () => setCurrentDir('') : onBack}
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            {folderName ?? 'Assets'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => {
                setBulkDeletePaths([...selected]);
                setBulkDeleteConfirm(true);
              }}
              className="h-10 px-4 text-sm"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete {selected.size}
            </Button>
          )}

          <Button onClick={() => fileInputRef.current?.click()} className="h-10 px-4 text-sm">
            <Upload className="mr-1.5 h-4 w-4" />
            Upload
          </Button>

          <Button
            variant="outline"
            onClick={() => setNewFolderOpen(true)}
            className="h-10 px-4 text-sm"
          >
            <FolderPlus className="mr-1.5 h-4 w-4" />
            New Folder
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleUploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading && entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading assets...</p>
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-foreground">Failed to load assets</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadEntries()}
            className="h-10 px-4 text-sm"
          >
            Retry
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <Images className="h-10 w-10 text-muted-foreground/40" />
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-foreground">No assets yet</p>
            <p className="text-sm text-muted-foreground">
              Upload images, SVGs, or fonts to use in your documents.
            </p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()} className="h-10 px-4 text-sm">
            <Upload className="mr-1.5 h-4 w-4" />
            Upload files
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {entries.map((entry) => (
            <AssetGridItem
              key={entry.path}
              entry={entry}
              workspaceName={workspaceName}
              isSelected={selected.has(entry.path)}
              anySelected={selected.size > 0}
              onSelect={() => toggleSelect(entry.path)}
              onNavigate={() => setCurrentDir(entry.path)}
              onPreview={() => setPreviewEntry(entry)}
              onRename={() => {
                setRenameTarget(entry);
                setRenameValue(entry.ext ? entry.name.slice(0, -entry.ext.length) : entry.name);
              }}
              onDelete={() => setDeleteConfirm(entry.path)}
              onDropAsset={
                entry.type === 'directory'
                  ? (assetPath) => void handleMoveToFolder(assetPath, entry.path)
                  : undefined
              }
              onMoveToParent={
                currentDir && entry.type !== 'directory'
                  ? () => void handleMoveToParent(entry.path)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog
        open={newFolderOpen}
        onOpenChange={(open) => {
          setNewFolderOpen(open);
          if (!open) {
            setNewFolderName('');
            setHasTouchedNewFolderName(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => {
              setHasTouchedNewFolderName(true);
              setNewFolderName(sanitizeAssetNameInput(e.target.value));
            }}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreateFolder()}
            className="h-11 px-4 text-base"
            autoFocus
          />
          {newFolderError && <p className="text-sm text-destructive">{newFolderError}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="h-11">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => void handleCreateFolder()}
              disabled={Boolean(newFolderError)}
              className="h-11"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Single Delete Confirm */}
      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteConfirm?.split('/').pop()}&quot;. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const path = deleteConfirm;
                setDeleteConfirm(null);
                if (path) void handleDelete(path);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirm */}
      <AlertDialog
        open={bulkDeleteConfirm}
        onOpenChange={(open) => {
          setBulkDeleteConfirm(open);
          if (!open) {
            setBulkDeletePaths([]);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeletePaths.length} item(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkDeletePaths.length <= 5
                ? `This will permanently delete: ${bulkDeletePaths.map((p) => p.split('/').pop()).join(', ')}. This cannot be undone.`
                : `This will permanently delete ${bulkDeletePaths.length} items. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleBulkDelete()}
              disabled={bulkDeletePaths.length === 0}
            >
              Delete {bulkDeletePaths.length} item(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Dialog */}
      {previewEntry && IMAGE_EXTS.has(previewEntry.ext) && (
        <PreviewDialog
          entry={previewEntry}
          workspaceName={workspaceName}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}
