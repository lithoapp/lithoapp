import { Folder, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

  const countLabel = `${docCount} ${docCount === 1 ? 'doc' : 'docs'}`;

  return (
    <button
      type="button"
      className={`group relative flex cursor-pointer items-center gap-4 rounded-lg border bg-card px-5 py-4 text-left transition-colors hover:border-primary/40 ${isDragOver ? 'border-primary ring-2 ring-primary/30' : ''}`}
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Folder className="h-8 w-8 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-semibold">{name}</span>
        <span className="text-sm text-muted-foreground">{countLabel}</span>
      </div>

      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
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
    </button>
  );
}
