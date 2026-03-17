import { Folder, FolderMinus, Images, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AssetEntry } from '../../../../shared/types';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

export { IMAGE_EXTS };

export function AssetGridItem({
  entry,
  workspaceName,
  isSelected,
  anySelected,
  onSelect,
  onNavigate,
  onPreview,
  onRename,
  onDelete,
  onDropAsset,
  onMoveToParent,
}: {
  entry: AssetEntry;
  workspaceName: string;
  isSelected: boolean;
  anySelected: boolean;
  onSelect: () => void;
  onNavigate: () => void;
  onPreview: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDropAsset?: (assetPath: string) => void;
  onMoveToParent?: () => void;
}): React.JSX.Element {
  const isImage = IMAGE_EXTS.has(entry.ext);
  const isDir = entry.type === 'directory';

  function handleClick(): void {
    if (isDir) {
      onNavigate();
    } else if (isImage) {
      onPreview();
    }
  }

  if (isDir) {
    return (
      <FolderCard
        entry={entry}
        isSelected={isSelected}
        anySelected={anySelected}
        onSelect={onSelect}
        onNavigate={onNavigate}
        onRename={onRename}
        onDelete={onDelete}
        onDropAsset={onDropAsset}
      />
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag source for moving assets into folders
    <div
      className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-litho-asset', entry.path);
        e.dataTransfer.effectAllowed = 'move';

        // Custom drag ghost: small dark pill with file name
        const ghost = document.createElement('div');
        ghost.style.cssText =
          'position:absolute;left:-9999px;top:-9999px;display:flex;align-items:center;' +
          'gap:8px;padding:6px 12px;background:#1a1a1a;color:#fff;border-radius:8px;' +
          'font-size:13px;font-weight:500;max-width:220px;white-space:nowrap;' +
          'overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(0,0,0,0.35);' +
          'pointer-events:none;';
        ghost.innerHTML =
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' +
          '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>' +
          '<circle cx="9" cy="9" r="2"/>' +
          '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>' +
          '</svg>' +
          `<span style="overflow:hidden;text-overflow:ellipsis">${entry.name}</span>`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 14, 16);
        requestAnimationFrame(() => document.body.removeChild(ghost));
      }}
    >
      {/* Checkbox */}
      <div
        className={`absolute top-1.5 left-1.5 z-10 transition-opacity ${anySelected || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          className="bg-white/80 backdrop-blur-sm"
        />
      </div>

      {/* Thumbnail */}
      <button
        type="button"
        className="relative flex h-36 w-full cursor-pointer items-center justify-center overflow-hidden border-b bg-muted/30"
        onClick={handleClick}
      >
        {isImage ? (
          <img
            src={`litho-asset://${workspaceName}/${entry.path}`}
            alt={entry.name}
            className="h-full w-full object-contain"
          />
        ) : (
          <Images className="h-10 w-10 text-muted-foreground/50" />
        )}
      </button>

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
            {onMoveToParent && (
              <DropdownMenuItem onClick={onMoveToParent}>
                <FolderMinus className="mr-2 h-3.5 w-3.5" />
                Move to Top Level
              </DropdownMenuItem>
            )}
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

function FolderCard({
  entry,
  isSelected,
  anySelected,
  onSelect,
  onNavigate,
  onRename,
  onDelete,
  onDropAsset,
}: {
  entry: AssetEntry;
  isSelected: boolean;
  anySelected: boolean;
  onSelect: () => void;
  onNavigate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDropAsset?: (assetPath: string) => void;
}): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent): void {
    if (!e.dataTransfer.types.includes('application/x-litho-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent): void {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const assetPath = e.dataTransfer.getData('application/x-litho-asset');
    if (assetPath && onDropAsset) onDropAsset(assetPath);
  }

  return (
    <div className="group relative h-full">
      {/* Checkbox */}
      <div
        className={`absolute top-1.5 left-1.5 z-10 transition-opacity ${anySelected || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Context menu */}
      <div className="absolute top-1.5 right-1.5 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="h-6 w-6">
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

      <button
        type="button"
        className={`flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 ${isDragOver ? 'border-primary ring-2 ring-primary/30' : ''}`}
        onClick={onNavigate}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Folder className="h-12 w-12 text-muted-foreground/30" />
        <p className="w-full truncate text-center text-sm font-medium">{entry.name}</p>
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
