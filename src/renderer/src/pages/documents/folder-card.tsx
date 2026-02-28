import { Folder, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Fixed thumbnail container height in px. */
const THUMB_HEIGHT = 180;

interface FolderCardProps {
  name: string;
  docCount: number;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onDropDoc: (slug: string) => void;
}

export function FolderCard({
  name,
  docCount,
  onClick,
  onRename,
  onDelete,
  onDropDoc,
}: FolderCardProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent): void {
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
    setIsDragOver(false);
    const slug = e.dataTransfer.getData('text/plain');
    if (slug) onDropDoc(slug);
  }

  return (
    <button
      type="button"
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/40 ${isDragOver ? 'border-primary ring-2 ring-primary/30' : ''}`}
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="relative flex items-center justify-center overflow-hidden border-b bg-muted/30"
        style={{ height: THUMB_HEIGHT }}
      >
        <Folder className="h-12 w-12 text-muted-foreground/30" />

        <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon-sm"
                className="h-6 w-6 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRename(name);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(name);
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-4 py-3">
        <p className="truncate text-base font-semibold">{name}</p>
        <p className="text-sm text-muted-foreground">
          {docCount} {docCount === 1 ? 'document' : 'documents'}
        </p>
      </div>
    </button>
  );
}
