import { formatDistanceToNow, parseISO } from 'date-fns';
import { Check, Clock, FileText, FolderOpen, Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WorkspaceInfo } from '@/hooks/use-workspace';
import { cn } from '@/lib/utils';

type TemplateId = 'minimal' | 'corporate' | 'brightside' | 'editorial';

interface TemplateOption {
  id: TemplateId;
  label: string;
}

const TEMPLATES: TemplateOption[] = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'brightside', label: 'Brightside' },
  { id: 'editorial', label: 'Editorial' },
];

interface WorkspacesPageProps {
  workspaces: WorkspaceInfo[];
  onWorkspaceSelected: (slug: string) => void;
  refreshWorkspaces: () => Promise<void>;
  userName?: string;
}

export function WorkspacesPage({
  workspaces,
  onWorkspaceSelected,
  refreshWorkspaces,
  userName,
}: WorkspacesPageProps): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('minimal');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectingSlug, setSelectingSlug] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const slug = await window.litho.workspace.create(newName.trim(), selectedTemplate);
      await refreshWorkspaces();
      setCreateOpen(false);
      setNewName('');
      setSelectedTemplate('minimal');
      onWorkspaceSelected(slug);
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
      onWorkspaceSelected(slug);
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
          selectedTemplate={selectedTemplate}
          onTemplateChange={setSelectedTemplate}
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
          const isSelecting = selectingSlug === ws.slug;

          return (
            <button
              key={ws.slug}
              type="button"
              onClick={() => void handleSelect(ws.slug)}
              className="group flex cursor-pointer flex-col rounded-lg border border-border bg-card p-5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                {isSelecting ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <FolderOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate text-base font-semibold">{ws.title}</span>
              </div>

              <div className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {ws.documentCount} {ws.documentCount === 1 ? 'document' : 'documents'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Last opened {formatDistanceToNow(parseISO(ws.lastOpenedAt), { addSuffix: true })}
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
        selectedTemplate={selectedTemplate}
        onTemplateChange={setSelectedTemplate}
        onSubmit={handleCreate}
        isCreating={isCreating}
        error={createError}
        onErrorClear={() => setCreateError(null)}
      />
    </div>
  );
}

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 360;
const THUMB_HEIGHT = 120;

function TemplatePreview({ html }: { html: string | null }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = containerWidth > 0 ? containerWidth / PREVIEW_WIDTH : 0;
  const scaledHeight = PREVIEW_HEIGHT * scale;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-t-lg bg-muted/30"
      style={{ height: scaledHeight > 0 ? scaledHeight : THUMB_HEIGHT }}
    >
      {html && containerWidth > 0 ? (
        <iframe
          srcDoc={html}
          title="Template preview"
          className="pointer-events-none absolute top-0 left-0 origin-top-left"
          style={{
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            transform: `scale(${scale})`,
            border: 'none',
          }}
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="flex h-full items-center justify-center" style={{ height: THUMB_HEIGHT }}>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
        </div>
      )}
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  selectedTemplate,
  onTemplateChange,
  onSubmit,
  isCreating,
  error,
  onErrorClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  selectedTemplate: TemplateId;
  onTemplateChange: (id: TemplateId) => void;
  onSubmit: () => void;
  isCreating: boolean;
  error: string | null;
  onErrorClear: () => void;
}): React.JSX.Element {
  const [previews, setPreviews] = useState<Record<string, string> | null>(null);

  const loadPreviews = useCallback(async () => {
    try {
      const result = (await window.litho.template.buildPreviews()) as Record<string, string>;
      setPreviews(result);
    } catch (err) {
      console.error('[workspaces] Failed to build template previews:', err);
    }
  }, []);

  useEffect(() => {
    if (open && !previews) {
      void loadPreviews();
    }
  }, [open, previews, loadPreviews]);

  function handleNameChange(value: string): void {
    onNameChange(value);
    if (error) onErrorClear();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <Input
            id="ws-name"
            placeholder="Project name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) void onSubmit();
            }}
            className="h-11 px-4 text-base"
            autoFocus
          />

          <div className="flex flex-col gap-2">
            <Label className="text-base">Design System Template</Label>
            <div className="grid grid-cols-3 gap-3">
              {TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => onTemplateChange(tmpl.id)}
                    className={cn(
                      'relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all',
                      isSelected
                        ? 'border-forge ring-2 ring-forge/30'
                        : 'border-border hover:border-muted-foreground/30',
                    )}
                  >
                    <TemplatePreview html={previews?.[tmpl.id] ?? null} />
                    {isSelected && (
                      <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-forge shadow-md">
                        <Check className="h-4 w-4 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
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
