import {
  ChevronLeft,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Images,
  Loader2,
  LogOut,
  Palette,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ChatDocumentLabelContext } from '@/components/chat/message-tool-labels';
import { WorkspaceChat } from '@/components/chat/workspace-chat';
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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import { isValidHexColor } from '../../../../shared/color-utils';
import {
  getFolderNameError,
  getPageSizeError,
  normalizeFolderName,
  sanitizeFolderNameInput,
} from '../../../../shared/document-validation';
import type { ColorPalette, DesignSystem, DocumentInfo } from '../../../../shared/types';
import { ExportDialog } from '../document/export-dialog';
import { DocumentCard, formatRelativeTime } from './document-card';
import { DocumentSkeleton } from './document-skeleton';
import { FolderCard } from './folder-card';
import { RenameDocumentDialog } from './rename-document-dialog';

interface SizePreset {
  name: string;
  width: number;
  height: number;
  unit: 'mm' | 'px';
}

interface SizeCategory {
  label: string;
  sizes: SizePreset[];
}

const SIZE_CATEGORIES: SizeCategory[] = [
  {
    label: 'Print',
    sizes: [
      { name: 'A4', width: 210, height: 297, unit: 'mm' },
      { name: 'A3', width: 297, height: 420, unit: 'mm' },
      { name: 'A5', width: 148, height: 210, unit: 'mm' },
      { name: 'Letter', width: 215.9, height: 279.4, unit: 'mm' },
      { name: 'Legal', width: 215.9, height: 355.6, unit: 'mm' },
      { name: 'Tabloid', width: 279.4, height: 431.8, unit: 'mm' },
    ],
  },
  {
    label: 'Social Media',
    sizes: [
      { name: 'Instagram Post', width: 1080, height: 1080, unit: 'px' },
      { name: 'Instagram Story', width: 1080, height: 1920, unit: 'px' },
      { name: 'Facebook Post', width: 1200, height: 630, unit: 'px' },
      { name: 'Facebook Cover', width: 820, height: 312, unit: 'px' },
      { name: 'Twitter/X Post', width: 1200, height: 675, unit: 'px' },
      { name: 'Twitter/X Header', width: 1500, height: 500, unit: 'px' },
      { name: 'LinkedIn Banner', width: 1584, height: 396, unit: 'px' },
      { name: 'Pinterest Pin', width: 1000, height: 1500, unit: 'px' },
    ],
  },
  {
    label: 'Video',
    sizes: [
      { name: 'YouTube Thumbnail', width: 1280, height: 720, unit: 'px' },
      { name: 'YouTube Channel Art', width: 2560, height: 1440, unit: 'px' },
    ],
  },
  {
    label: 'Presentation',
    sizes: [
      { name: 'Slide 16:9', width: 1920, height: 1080, unit: 'px' },
      { name: 'Slide 4:3', width: 1024, height: 768, unit: 'px' },
    ],
  },
  {
    label: 'Ads & Display',
    sizes: [
      { name: 'Leaderboard', width: 728, height: 90, unit: 'px' },
      { name: 'Medium Rectangle', width: 300, height: 250, unit: 'px' },
      { name: 'Wide Skyscraper', width: 160, height: 600, unit: 'px' },
      { name: 'Facebook Ad', width: 1200, height: 628, unit: 'px' },
    ],
  },
  {
    label: 'Marketing',
    sizes: [
      { name: 'Logo', width: 500, height: 500, unit: 'px' },
      { name: 'Email Header', width: 600, height: 200, unit: 'px' },
      { name: 'Blog Banner', width: 1200, height: 600, unit: 'px' },
      { name: 'Infographic', width: 800, height: 2000, unit: 'px' },
    ],
  },
];

function groupDocuments(docs: DocumentInfo[]): {
  ungrouped: DocumentInfo[];
  folders: Map<string, DocumentInfo[]>;
} {
  const ungrouped: DocumentInfo[] = [];
  const folders = new Map<string, DocumentInfo[]>();
  for (const doc of docs) {
    if (!doc.folder) {
      ungrouped.push(doc);
      continue;
    }
    const list = folders.get(doc.folder) ?? [];
    list.push(doc);
    folders.set(doc.folder, list);
  }
  return { ungrouped, folders };
}

interface DocumentsPageProps {
  workspaceName: string;
  workspaceTitle: string;
  documents: DocumentInfo[];
  designSystemDoc: DocumentInfo | null;
  designSystem: DesignSystem | null;
  chatDocuments: ChatDocumentLabelContext[];
  isLoading: boolean;
  refetch: () => Promise<void>;
  onSelectDocument: (slug: string) => void;
  onOpenDesignSystem: () => void;
  onOpenAssets: () => void;
  onCloseWorkspace: () => void;
  onAgentBusyChange?: (busy: boolean) => void;
  onAgentLeaveRequestChange?: (handler: (() => Promise<void>) | null) => void;
}

export function DocumentsPage({
  workspaceName,
  workspaceTitle,
  documents: documentsProp,
  designSystemDoc,
  designSystem,
  chatDocuments,
  isLoading,
  refetch,
  onSelectDocument,
  onOpenDesignSystem,
  onOpenAssets,
  onCloseWorkspace,
  onAgentBusyChange,
  onAgentLeaveRequestChange,
}: DocumentsPageProps): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSize, setNewSize] = useState('A4');
  const [sizeCategory, setSizeCategory] = useState(SIZE_CATEGORIES[0].label);
  const [customWidth, setCustomWidth] = useState('1080');
  const [customHeight, setCustomHeight] = useState('1080');
  const [customUnit, setCustomUnit] = useState<'px' | 'mm'>('px');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [assignFolderSlug, setAssignFolderSlug] = useState<string | null>(null);
  const [renameFolderOld, setRenameFolderOld] = useState<string | null>(null);
  const [deleteFolderName, setDeleteFolderName] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [hasTouchedNewFolderName, setHasTouchedNewFolderName] = useState(false);
  const [isBackDragOver, setIsBackDragOver] = useState(false);
  const [localFolderNames, setLocalFolderNames] = useState<Set<string>>(new Set());
  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [exportDocId, setExportDocId] = useState<string | null>(null);

  const documents = documentsProp;
  const { ungrouped, folders: folderMap } = groupDocuments(documents);
  const serverFolderNames = [...folderMap.keys()].sort();
  const allFolderNames = [...new Set([...serverFolderNames, ...localFolderNames])].sort();

  const renameDoc = renameDocId ? documents.find((d) => d.id === renameDocId) : null;
  const exportDoc = exportDocId ? documents.find((d) => d.id === exportDocId) : null;
  const newFolderError = hasTouchedNewFolderName ? getFolderNameError(newFolderName) : null;
  const customSizeError =
    newSize === 'Custom'
      ? getPageSizeError({
          width: Number(customWidth),
          height: Number(customHeight),
          unit: customUnit,
        })
      : null;

  function handleCreateFolder(): void {
    const name = normalizeFolderName(newFolderName);
    const folderError = getFolderNameError(name);
    setHasTouchedNewFolderName(true);
    if (folderError) return;
    setLocalFolderNames((prev) => new Set([...prev, name]));
    setNewFolderOpen(false);
    setNewFolderName('');
    setHasTouchedNewFolderName(false);
  }

  async function handleCreate(): Promise<void> {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const size =
        newSize === 'Custom'
          ? { width: Number(customWidth), height: Number(customHeight), unit: customUnit }
          : newSize;
      const docId = await window.litho.document.create(
        workspaceName,
        newTitle.trim(),
        size,
        currentFolder ?? undefined,
      );
      await refetch();
      setCreateOpen(false);
      setNewTitle('');
      setNewSize('A4');
      setCreateError(null);
      onSelectDocument(docId);
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

  function confirmDelete(e: React.MouseEvent, slug: string): void {
    e.stopPropagation();
    setDeleteConfirm(slug);
  }

  async function handleDelete(): Promise<void> {
    if (!deleteConfirm) return;
    setIsDeleting(deleteConfirm);
    setDeleteConfirm(null);
    try {
      await window.litho.document.delete(workspaceName, deleteConfirm);
      await refetch();
    } catch (err) {
      console.error('[documents] Delete failed:', err);
      toast.error('Failed to delete document');
    } finally {
      setIsDeleting(null);
    }
  }

  async function handleRenameDocument(newDocTitle: string): Promise<void> {
    if (!renameDocId) return;
    try {
      await window.litho.document.rename(workspaceName, renameDocId, newDocTitle);
      await refetch();
    } catch (err) {
      console.error('[documents] Rename failed:', err);
      toast.error('Failed to rename document');
    } finally {
      setRenameDocId(null);
    }
  }

  async function handleDuplicate(docId: string): Promise<void> {
    try {
      await window.litho.document.duplicate(workspaceName, docId);
      await refetch();
      toast.success('Document duplicated');
    } catch (err) {
      console.error('[documents] Duplicate failed:', err);
      toast.error('Failed to duplicate document');
    }
  }

  async function handleAssignFolder(slug: string, folderName: string): Promise<void> {
    try {
      await window.litho.document.updateFolder(workspaceName, slug, folderName);
      await refetch();
    } catch (err) {
      console.error('[documents] Assign folder failed:', err);
      toast.error('Failed to move document to folder');
    }
  }

  async function handleRemoveFromFolder(slug: string): Promise<void> {
    try {
      await window.litho.document.updateFolder(workspaceName, slug, '');
      await refetch();
    } catch (err) {
      console.error('[documents] Remove from folder failed:', err);
      toast.error('Failed to remove document from folder');
    }
  }

  async function handleRenameFolder(oldName: string, newName: string): Promise<void> {
    const docs = folderMap.get(oldName) ?? [];
    try {
      await Promise.all(
        docs.map((doc) => window.litho.document.updateFolder(workspaceName, doc.id, newName)),
      );
      await refetch();
      if (currentFolder === oldName) setCurrentFolder(newName);
      setLocalFolderNames((prev) => {
        if (!prev.has(oldName)) return prev;
        const next = new Set(prev);
        next.delete(oldName);
        next.add(newName);
        return next;
      });
    } catch (err) {
      console.error('[documents] Rename folder failed:', err);
      toast.error('Failed to rename folder');
    }
  }

  async function handleDeleteFolder(name: string): Promise<void> {
    const docs = folderMap.get(name) ?? [];
    try {
      await Promise.all(
        docs.map((doc) => window.litho.document.updateFolder(workspaceName, doc.id, '')),
      );
      await refetch();
      if (currentFolder === name) setCurrentFolder(null);
      setLocalFolderNames((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    } catch (err) {
      console.error('[documents] Delete folder failed:', err);
      toast.error('Failed to delete folder');
    }
  }

  const folderDocs = currentFolder ? (folderMap.get(currentFolder) ?? []) : null;

  function renderDocCard(doc: DocumentInfo): React.JSX.Element {
    return (
      <DocumentCard
        key={doc.id}
        doc={doc}
        workspaceName={workspaceName}
        isDeleting={isDeleting === doc.id}
        onDelete={confirmDelete}
        onRename={(docId) => setRenameDocId(docId)}
        onDuplicate={(docId) => void handleDuplicate(docId)}
        onExport={(docId) => setExportDocId(docId)}
        onAssignFolder={(slug) => setAssignFolderSlug(slug)}
        onRemoveFromFolder={(slug) => void handleRemoveFromFolder(slug)}
        onClick={() => onSelectDocument(doc.id)}
      />
    );
  }

  const handleToolComplete = (tool: string, _args: Record<string, unknown>) => {
    if (
      tool === 'createDocument' ||
      tool === 'deleteDocument' ||
      tool === 'renameDocument' ||
      tool === 'moveDocumentToFolder' ||
      tool === 'duplicateDocument' ||
      tool === 'updateDocumentDescription'
    ) {
      void refetch();
    }
  };

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={70} minSize={40}>
        <div className="h-full overflow-auto p-6">
          <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-end justify-between">
              {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target for moving documents out of folder */}
              <div
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors',
                  isBackDragOver && 'bg-primary/10 ring-2 ring-primary/30',
                )}
                onDragOver={(e) => {
                  if (!currentFolder) return;
                  if (!e.dataTransfer.types.includes('text/plain')) return;
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
                  setIsBackDragOver(false);
                  const slug = e.dataTransfer.getData('text/plain');
                  if (slug) void handleRemoveFromFolder(slug);
                }}
              >
                {currentFolder && (
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted"
                    onClick={() => setCurrentFolder(null)}
                  >
                    <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                  </button>
                )}
                <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                  {currentFolder ?? workspaceTitle}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setCreateOpen(true)} className="h-10 px-4 text-sm">
                  <FilePlus className="mr-1.5 h-4 w-4" />
                  New Document
                </Button>
                {currentFolder === null && (
                  <Button
                    variant="outline"
                    onClick={() => setNewFolderOpen(true)}
                    className="h-10 px-4 text-sm"
                  >
                    <FolderPlus className="mr-1.5 h-4 w-4" />
                    New Folder
                  </Button>
                )}
                <Button variant="outline" onClick={onCloseWorkspace} className="h-10 px-4 text-sm">
                  <LogOut className="mr-1.5 h-4 w-4" />
                  Exit
                </Button>
              </div>
            </div>

            {/* Loading skeleton */}
            {isLoading && documents.length === 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {['s1', 's2', 's3', 's4', 's5', 's6'].map((key) => (
                  <DocumentSkeleton key={key} />
                ))}
              </div>
            ) : /* Empty state */
            currentFolder === null &&
              allFolderNames.length === 0 &&
              ungrouped.length === 0 &&
              !designSystemDoc ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40" />
                <div className="flex flex-col gap-1">
                  <p className="text-base font-semibold text-foreground">No documents yet</p>
                  <p className="text-sm text-muted-foreground">
                    Create your first document to start designing.
                  </p>
                </div>
                <Button onClick={() => setCreateOpen(true)} className="h-10 px-4 text-sm">
                  <FilePlus className="mr-1.5 h-4 w-4" />
                  New Document
                </Button>
              </div>
            ) : currentFolder !== null && (folderDocs?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <Folder className="h-10 w-10 text-muted-foreground/40" />
                <div className="flex flex-col gap-1">
                  <p className="text-base font-semibold text-foreground">This folder is empty</p>
                  <p className="text-sm text-muted-foreground">
                    Create a document or drag one in from the top level.
                  </p>
                </div>
                <Button onClick={() => setCreateOpen(true)} className="h-10 px-4 text-sm">
                  <FilePlus className="mr-1.5 h-4 w-4" />
                  New Document
                </Button>
              </div>
            ) : (
              <>
                {/* Workspace row — Design System + Assets (top level only) */}
                {currentFolder === null && (
                  <div className="flex flex-wrap gap-3">
                    {designSystemDoc && (
                      <DesignSystemDocCard
                        doc={designSystemDoc}
                        palettes={designSystem?.colors.palettes ?? []}
                        onClick={onOpenDesignSystem}
                      />
                    )}
                    <AssetsCard onClick={onOpenAssets} />
                  </div>
                )}

                {/* Folders row (top level only, when folders exist) */}
                {currentFolder === null && allFolderNames.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {allFolderNames.map((name) => (
                      <FolderCard
                        key={name}
                        name={name}
                        docCount={folderMap.get(name)?.length ?? 0}
                        onClick={() => setCurrentFolder(name)}
                        onRename={(n) => setRenameFolderOld(n)}
                        onDelete={(n) => setDeleteFolderName(n)}
                        onDropDoc={(slug) => void handleAssignFolder(slug, name)}
                      />
                    ))}
                  </div>
                )}

                {/* Document grid */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {currentFolder === null
                    ? ungrouped.map(renderDocCard)
                    : folderDocs?.map(renderDocCard)}
                </div>
              </>
            )}

            {/* New Folder dialog */}
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
                    setNewFolderName(sanitizeFolderNameInput(e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !newFolderError) handleCreateFolder();
                  }}
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
                    onClick={handleCreateFolder}
                    disabled={Boolean(newFolderError)}
                    className="h-11"
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Create document dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogContent className="gap-0 p-0 sm:max-w-[70vw]">
                <div className="flex flex-col gap-4 p-6 pb-5">
                  <DialogHeader>
                    <DialogTitle>New Document</DialogTitle>
                  </DialogHeader>
                  <Input
                    id="doc-title"
                    placeholder="Document title"
                    value={newTitle}
                    onChange={(e) => {
                      setNewTitle(e.target.value);
                      if (createError) setCreateError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTitle.trim()) void handleCreate();
                    }}
                    className="h-11 px-4 text-base"
                    autoFocus
                  />
                  {createError && <p className="text-sm text-destructive">{createError}</p>}
                </div>

                {/* Category sidebar + size cards */}
                <div className="flex border-t">
                  <nav className="flex w-40 shrink-0 flex-col gap-1 border-r p-3">
                    {SIZE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.label}
                        type="button"
                        className={cn(
                          'rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                          sizeCategory === cat.label
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        )}
                        onClick={() => setSizeCategory(cat.label)}
                      >
                        {cat.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={cn(
                        'rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                        sizeCategory === 'Custom'
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                      onClick={() => {
                        setSizeCategory('Custom');
                        setNewSize('Custom');
                      }}
                    >
                      Custom
                    </button>
                  </nav>
                  <div className="flex-1 p-5">
                    {sizeCategory === 'Custom' ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="custom-w" className="text-sm text-muted-foreground">
                              Width
                            </label>
                            <Input
                              id="custom-w"
                              type="number"
                              min={1}
                              value={customWidth}
                              onChange={(e) => setCustomWidth(e.target.value)}
                              aria-invalid={customSizeError ? true : undefined}
                              className="h-10 w-32 px-3 text-base"
                            />
                          </div>
                          <span className="mt-6 text-muted-foreground">×</span>
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="custom-h" className="text-sm text-muted-foreground">
                              Height
                            </label>
                            <Input
                              id="custom-h"
                              type="number"
                              min={1}
                              value={customHeight}
                              onChange={(e) => setCustomHeight(e.target.value)}
                              aria-invalid={customSizeError ? true : undefined}
                              className="h-10 w-32 px-3 text-base"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <span className="text-sm text-muted-foreground">Unit</span>
                            <div className="flex overflow-hidden rounded-md border">
                              <button
                                type="button"
                                className={cn(
                                  'px-3 py-2 text-sm font-medium transition-colors',
                                  customUnit === 'px'
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground hover:bg-muted/50',
                                )}
                                onClick={() => setCustomUnit('px')}
                              >
                                px
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  'border-l px-3 py-2 text-sm font-medium transition-colors',
                                  customUnit === 'mm'
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground hover:bg-muted/50',
                                )}
                                onClick={() => setCustomUnit('mm')}
                              >
                                mm
                              </button>
                            </div>
                          </div>
                        </div>
                        {customSizeError && (
                          <p className="text-sm text-destructive">{customSizeError}</p>
                        )}
                      </div>
                    ) : (
                      SIZE_CATEGORIES.filter((cat) => cat.label === sizeCategory).map((cat) => (
                        <div
                          key={cat.label}
                          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                        >
                          {cat.sizes.map((size) => (
                            <SizeCard
                              key={size.name}
                              size={size}
                              isSelected={newSize === size.name}
                              onSelect={() => setNewSize(size.name)}
                            />
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer */}
                <DialogFooter className="border-t px-6 py-4">
                  <DialogClose asChild>
                    <Button variant="outline" className="h-11">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={isCreating || !newTitle.trim() || Boolean(customSizeError)}
                    className="h-11"
                  >
                    {isCreating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete document confirmation */}
            <AlertDialog
              open={deleteConfirm !== null}
              onOpenChange={(open) => !open && setDeleteConfirm(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete document?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete &quot;
                    {documents.find((d) => d.id === deleteConfirm)?.title ?? deleteConfirm}
                    &quot; and all its pages. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Move to folder dialog */}
            <MoveFolderDialog
              open={assignFolderSlug !== null}
              folders={allFolderNames}
              onAssign={(folderName) => {
                if (assignFolderSlug) void handleAssignFolder(assignFolderSlug, folderName);
                setAssignFolderSlug(null);
              }}
              onClose={() => setAssignFolderSlug(null)}
            />

            {/* Rename folder dialog */}
            <RenameFolderDialog
              oldName={renameFolderOld}
              onRename={(newName) => {
                if (renameFolderOld) void handleRenameFolder(renameFolderOld, newName);
                setRenameFolderOld(null);
              }}
              onClose={() => setRenameFolderOld(null)}
            />

            {/* Rename document dialog */}
            <RenameDocumentDialog
              open={renameDocId !== null}
              currentTitle={renameDoc?.title ?? ''}
              onRename={(newDocTitle) => void handleRenameDocument(newDocTitle)}
              onClose={() => setRenameDocId(null)}
            />

            {/* Export dialog for card-level export */}
            {exportDoc && (
              <ExportDialog
                doc={exportDoc}
                workspaceName={workspaceName}
                open={exportDocId !== null}
                onOpenChange={(open) => {
                  if (!open) setExportDocId(null);
                }}
              />
            )}

            {/* Delete folder confirmation */}
            <AlertDialog
              open={deleteFolderName !== null}
              onOpenChange={(open) => !open && setDeleteFolderName(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete folder?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the &quot;{deleteFolderName}&quot; folder. All documents inside
                    will move to the top level. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      if (deleteFolderName) void handleDeleteFolder(deleteFolderName);
                      setDeleteFolderName(null);
                    }}
                  >
                    Delete folder
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={30} minSize={20}>
        <WorkspaceChat
          workspaceName={workspaceName}
          workspaceTitle={workspaceTitle}
          documents={chatDocuments}
          onToolComplete={handleToolComplete}
          onBusyChange={onAgentBusyChange}
          onLeaveRequestChange={onAgentLeaveRequestChange}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/** Max height for the aspect-ratio shape inside a size card. */
const SIZE_CARD_MAX_H = 56;

function SizeCard({
  size,
  isSelected,
  onSelect,
}: {
  size: SizePreset;
  isSelected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  const dims =
    size.unit === 'mm' ? `${size.width} × ${size.height} mm` : `${size.width} × ${size.height} px`;

  return (
    <button
      type="button"
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg px-3 py-3 transition-colors',
        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50',
      )}
      onClick={onSelect}
    >
      <div className="flex w-full items-center justify-center" style={{ height: SIZE_CARD_MAX_H }}>
        <div
          className={cn(
            'flex max-w-full items-center justify-center overflow-hidden rounded-sm border-2',
            isSelected ? 'border-primary bg-primary/15' : 'border-muted-foreground/30 bg-muted',
          )}
          style={{
            aspectRatio: `${size.width} / ${size.height}`,
            height: '100%',
            maxHeight: SIZE_CARD_MAX_H,
          }}
        >
          <span
            className={cn(
              'truncate px-1 text-[9px] font-medium leading-none',
              isSelected ? 'text-primary' : 'text-muted-foreground/60',
            )}
          >
            {size.name}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <p className={cn('text-base leading-tight', isSelected ? 'font-semibold' : 'font-medium')}>
          {size.name}
        </p>
        <p className="text-sm text-muted-foreground">{dims}</p>
      </div>
    </button>
  );
}

function MoveFolderDialog({
  open,
  folders,
  onAssign,
  onClose,
}: {
  open: boolean;
  folders: string[];
  onAssign: (folderName: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
        </DialogHeader>
        {folders.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No folders yet. Create one first from the documents page.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {folders.map((f) => (
              <button
                key={f}
                type="button"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-base hover:bg-accent"
                onClick={() => onAssign(f)}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                {f}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-11">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameFolderDialog({
  oldName,
  onRename,
  onClose,
}: {
  oldName: string | null;
  onRename: (newName: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (oldName !== null) setValue(oldName);
  }, [oldName]);

  const normalizedValue = normalizeFolderName(value);
  const valueError = getFolderNameError(value);
  const isValid = !valueError && normalizedValue !== oldName;

  return (
    <Dialog open={oldName !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
        </DialogHeader>
        <Input
          id="rename-folder"
          placeholder="Folder name"
          value={value}
          onChange={(e) => setValue(sanitizeFolderNameInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isValid) onRename(normalizedValue);
          }}
          className="h-11 px-4 text-base"
        />
        {valueError && <p className="text-sm text-destructive">{valueError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-11">
            Cancel
          </Button>
          <Button disabled={!isValid} onClick={() => onRename(normalizedValue)} className="h-11">
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Get hex values from the primary palette shades for a color strip. */
function getPrimaryShades(palettes: ColorPalette[]): string[] {
  const primary = palettes.find((p) => p.name.toLowerCase() === 'primary');
  if (!primary) return [];
  return primary.shades.map((s) => s.value).filter((value) => isValidHexColor(value));
}

function DesignSystemDocCard({
  doc,
  palettes,
  onClick,
}: {
  doc: DocumentInfo;
  palettes: ColorPalette[];
  onClick: () => void;
}): React.JSX.Element {
  const pageCountLabel =
    doc.pages.length === 0
      ? 'Empty'
      : `${doc.pages.length} ${doc.pages.length === 1 ? 'page' : 'pages'}`;

  const metaParts: string[] = [pageCountLabel];
  if (doc.updatedAt) {
    metaParts.push(formatRelativeTime(doc.updatedAt));
  }

  const shades = getPrimaryShades(palettes);

  return (
    <button
      type="button"
      className="group relative flex cursor-pointer items-center gap-4 rounded-lg border border-primary/30 bg-card px-5 py-4 text-left transition-colors hover:border-primary/60"
      onClick={onClick}
    >
      {shades.length > 0 ? (
        <div className="flex h-8 shrink-0 overflow-hidden rounded-lg">
          {shades.map((color, i) => (
            <div
              key={`${color}-${String(i)}`}
              className="h-full w-2"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      ) : (
        <Palette className="h-8 w-8 shrink-0 text-primary" />
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-semibold">Design System</span>
        <span className="text-sm text-muted-foreground">{metaParts.join(' · ')}</span>
      </div>
    </button>
  );
}

function AssetsCard({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className="group relative flex cursor-pointer items-center gap-4 rounded-lg border bg-card px-5 py-4 text-left transition-colors hover:border-primary/40"
      onClick={onClick}
    >
      <Images className="h-8 w-8 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-semibold">Assets</span>
        <span className="text-sm text-muted-foreground">Images, SVGs, fonts</span>
      </div>
    </button>
  );
}
