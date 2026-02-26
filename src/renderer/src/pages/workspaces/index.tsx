import { FileText, FolderOpen, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import type { WorkspaceInfo, WorkspaceState } from '@/hooks/use-workspace';
import { cn } from '@/lib/utils';

interface WorkspacesPageProps {
  workspaces: WorkspaceInfo[];
  activeInfo: WorkspaceState;
  onWorkspaceSelected: () => void;
  refreshWorkspaces: () => Promise<void>;
  userName?: string;
}

export function WorkspacesPage({
  workspaces,
  activeInfo,
  onWorkspaceSelected,
  refreshWorkspaces,
  userName,
}: WorkspacesPageProps): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectingSlug, setSelectingSlug] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await window.litho.workspace.create(newName.trim());
      await refreshWorkspaces();
      setCreateOpen(false);
      setNewName('');
      onWorkspaceSelected();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.replace(/^Error invoking remote method.*?:\s*/i, '')
          : String(err);
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSelect(slug: string): Promise<void> {
    setSelectingSlug(slug);
    try {
      await window.litho.workspace.select(slug);
      await refreshWorkspaces();
      onWorkspaceSelected();
    } catch (err) {
      console.error('[workspaces] Select failed:', err);
      toast.error('Failed to open project');
    } finally {
      setSelectingSlug(null);
    }
  }

  const firstName = userName?.split(' ')[0];

  if (workspaces.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            {firstName ? `Welcome, ${firstName}` : 'Welcome to Litho'}
          </h1>
          <p className="text-base text-muted-foreground">
            Create your first project to start designing.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-11 px-5 text-base">
          <Plus className="mr-1.5 h-4 w-4" />
          New Project
        </Button>
        <CreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          name={newName}
          onNameChange={setNewName}
          onSubmit={handleCreate}
          isCreating={isCreating}
          error={createError}
          onErrorClear={() => setCreateError(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          {firstName ? `Welcome back, ${firstName}` : 'Your Projects'}
        </h1>
        <Button onClick={() => setCreateOpen(true)} className="h-10 px-4 text-sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((ws) => {
          const isActive = activeInfo.workspaceName === ws.slug;
          const isSelecting = selectingSlug === ws.slug;

          return (
            <button
              key={ws.slug}
              type="button"
              onClick={() => {
                if (isActive) {
                  onWorkspaceSelected();
                } else {
                  void handleSelect(ws.slug);
                }
              }}
              className={cn(
                'group flex cursor-pointer flex-col rounded-lg border p-5 text-left transition-colors hover:bg-muted/50',
                isActive ? 'border-forge/40 bg-forge/5' : 'border-border',
              )}
            >
              <div className="flex items-center gap-3">
                {isSelecting ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <FolderOpen
                    className={cn(
                      'h-5 w-5 shrink-0',
                      isActive ? 'text-forge' : 'text-muted-foreground',
                    )}
                  />
                )}
                <span className="min-w-0 truncate text-base font-semibold">{ws.name}</span>
                {isActive && (
                  <Badge className="bg-forge/15 text-forge border-forge/30 shrink-0 text-xs">
                    Active
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {ws.documentCount} {ws.documentCount === 1 ? 'document' : 'documents'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        name={newName}
        onNameChange={setNewName}
        onSubmit={handleCreate}
        isCreating={isCreating}
        error={createError}
        onErrorClear={() => setCreateError(null)}
      />
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  onSubmit,
  isCreating,
  error,
  onErrorClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  isCreating: boolean;
  error: string | null;
  onErrorClear: () => void;
}): React.JSX.Element {
  function handleNameChange(value: string): void {
    onNameChange(value);
    if (error) onErrorClear();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ws-name" className="text-base">
              Name
            </Label>
            <Input
              id="ws-name"
              placeholder="My Brand"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) void onSubmit();
              }}
              className="h-11 px-4 text-base"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="h-11">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={onSubmit} disabled={isCreating || !name.trim()} className="h-11">
            {isCreating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
