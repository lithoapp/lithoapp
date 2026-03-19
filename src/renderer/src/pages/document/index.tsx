import * as Sentry from '@sentry/electron/renderer';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Loader2,
  Maximize2,
  Minus,
  Pencil,
  Plus,
} from 'lucide-react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { DocumentChat } from '@/components/chat/document-chat';
import { PendingChangesPanel } from '@/components/edit-mode/pending-changes-panel';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditMode } from '@/hooks/use-edit-mode';
import { addDiagnosticPrefix } from '@/hooks/use-post-turn-diagnostics';
import type { PageAudit } from '@/lib/page-audit-types';
import { runPageAudits } from '@/lib/page-auditors/run-page-audits';
import { cn } from '@/lib/utils';
import type { DocumentInfo } from '../../../../shared/types';
import { DocumentAssetsView } from './document-assets-view';
import { ExportDialog } from './export-dialog';
import { PageAuditBar } from './page-audit-bar';

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const VIEWER_PADDING = 40;

interface DocumentPageProps {
  doc: DocumentInfo;
  workspaceName: string;
  workspaceTitle?: string;
  onBack: () => void;
  onDocumentsChange?: () => void;
  userName?: string;
  /** Render a custom chat panel instead of the default DocumentChat. */
  renderChat?: (props: {
    workspaceName: string;
    workspaceTitle?: string;
    onToolComplete: (tool: string, args: Record<string, unknown>) => void;
    sendMessageRef: React.RefObject<((text: string) => void) | null>;
    onBusyChange: (isBusy: boolean) => void;
    onLeaveRequestChange: (handler: (() => Promise<void>) | null) => void;
  }) => React.ReactNode;
  /** Tool names that should trigger a full rebuild of all pages (e.g. CSS changes). */
  rebuildAllOnTools?: string[];
  /** When true, refetch doc config via IPC on createPage/deletePage instead of calling onDocumentsChange. */
  refetchDocOnPageChange?: boolean;
  /** Notify parent when the AI agent becomes busy or idle. */
  onAgentBusyChange?: (busy: boolean) => void;
  onAgentLeaveRequestChange?: (handler: (() => Promise<void>) | null) => void;
}

export function DocumentPage({
  doc,
  workspaceName,
  workspaceTitle,
  onBack,
  onDocumentsChange,
  userName,
  renderChat,
  rebuildAllOnTools,
  refetchDocOnPageChange,
  onAgentBusyChange,
  onAgentLeaveRequestChange,
}: DocumentPageProps): React.JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [fitToWidth, setFitToWidth] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [pageHtmlMap, setPageHtmlMap] = useState<Map<string, string>>(new Map());
  const [pageAudits, setPageAudits] = useState<Map<string, PageAudit[]>>(new Map());
  const [isAgentBusy, setIsAgentBusy] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'assets'>('preview');
  // When refetchDocOnPageChange is true, we manage pages internally so
  // createPage/deletePage can refresh without going through the parent.
  const [internalPages, setInternalPages] = useState(doc.pages);
  useEffect(() => {
    setInternalPages(doc.pages);
  }, [doc.pages]);
  const pages = refetchDocOnPageChange ? internalPages : doc.pages;

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const viewerRef = useRef<HTMLDivElement>(null);
  const sendMessageRef = useRef<((text: string) => void) | null>(null);

  const {
    editMode,
    pendingChanges,
    toggleEditMode,
    removePendingChange,
    confirmEdits,
    discardEdits,
  } = useEditMode({
    workspaceName,
    docId: doc.id,
    pages,
    setPageHtmlMap,
    sendMessageRef,
  });

  // Intrinsic page size in px
  const pageWidthPx = doc.size.width * (doc.size.unit === 'mm' ? 3.7795 : 1);
  const pageHeightPx = doc.size.height * (doc.size.unit === 'mm' ? 3.7795 : 1);

  // Fit-to-width via ResizeObserver
  useEffect(() => {
    if (!fitToWidth) return;
    const el = viewerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) {
        setZoom((width - VIEWER_PADDING * 2) / pageWidthPx);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitToWidth, pageWidthPx]);

  // IntersectionObserver for current page detection.
  // Track ratios across all pages to avoid flicker from partial batch updates.
  const ratiosRef = useRef<Map<number, number>>(new Map());
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach observer when pages or zoom change
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    ratiosRef.current.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number(entry.target.getAttribute('data-page-index'));
          ratiosRef.current.set(idx, entry.intersectionRatio);
        }
        let bestIdx = -1;
        let bestRatio = 0;
        for (const [idx, ratio] of ratiosRef.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIdx = idx;
          }
        }
        if (bestIdx >= 0) setCurrentPage(bestIdx);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of pageRefs.current.values()) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages.length, zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setFitToWidth(false);
        setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
      } else if (mod && e.key === '-') {
        e.preventDefault();
        setFitToWidth(false);
        setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
      } else if (mod && e.key === '0') {
        e.preventDefault();
        setFitToWidth(true);
      }

      // Page navigation — only when focus is not inside an input/textarea/iframe
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'IFRAME') return;
      if (mod) return;

      if (e.key === 'PageDown' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage((prev) => {
          const next = Math.min(prev + 1, pages.length - 1);
          const el = pageRefs.current.get(next);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return next;
        });
      } else if (e.key === 'PageUp' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage((prev) => {
          const next = Math.max(prev - 1, 0);
          const el = pageRefs.current.get(next);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return next;
        });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pages.length]);

  // Build page HTML lazily: current page first, then remaining pages
  const buildPages = useCallback(async () => {
    if (pages.length === 0) return;

    // Build current page first for instant display
    const firstPageId = (pages[currentPage] ?? pages[0]).id;
    try {
      const result = await window.litho.renderer.build(workspaceName, doc.id, firstPageId);
      if (result.ok) {
        setPageHtmlMap((prev) => new Map(prev).set(firstPageId, result.data.html));
      } else {
        console.error(`[document] Build failed for ${firstPageId}:`, result.error);
      }
    } catch (err) {
      console.error(`[document] Build failed for ${firstPageId}:`, err);
      Sentry.captureException(err);
    }

    // Build remaining pages in background
    for (const page of pages) {
      if (page.id === firstPageId) continue;
      try {
        const result = await window.litho.renderer.build(workspaceName, doc.id, page.id);
        if (result.ok) {
          setPageHtmlMap((prev) => new Map(prev).set(page.id, result.data.html));
        } else {
          console.error(`[document] Build failed for ${page.id}:`, result.error);
        }
      } catch (err) {
        console.error(`[document] Build failed for ${page.id}:`, err);
        Sentry.captureException(err);
      }
    }
  }, [workspaceName, doc.id, pages, currentPage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: build pages on mount and when doc changes
  useEffect(() => {
    setPageHtmlMap(new Map());
    setPageAudits(new Map());
    void buildPages();
  }, [workspaceName, doc.id, pages]);

  const handleZoomIn = useCallback(() => {
    setFitToWidth(false);
    setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitToWidth(false);
    setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  }, []);

  const handleFitToWidth = useCallback(() => {
    setFitToWidth(true);
  }, []);

  const handleThumbnailClick = useCallback((index: number) => {
    const el = pageRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const setPageRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(index, el);
    } else {
      pageRefs.current.delete(index);
    }
  }, []);

  // Rebuild a single page after the agent edits it
  const buildPage = useCallback(
    async (pageId: string) => {
      setPageAudits((prev) => {
        const next = new Map(prev);
        next.delete(pageId);
        return next;
      });
      try {
        const result = await window.litho.renderer.build(workspaceName, doc.id, pageId);
        if (result.ok) {
          setPageHtmlMap((prev) => new Map(prev).set(pageId, result.data.html));
        }
      } catch (err) {
        console.error(`[document] Build failed for ${pageId}:`, err);
        Sentry.captureException(err);
      }
    },
    [workspaceName, doc.id],
  );

  // Refetch doc config internally (used when refetchDocOnPageChange is true).
  const refetchDocConfig = useCallback(async () => {
    try {
      const config = await window.litho.document.read(workspaceName, doc.id);
      setInternalPages(config.pages);
    } catch {
      // non-fatal
    }
  }, [workspaceName, doc.id]);

  // Handle completed litho tool calls.
  // writePage/editPage → rebuild the specific page only.
  // createPage/deletePage → refetch doc list or doc config depending on mode.
  // rebuildAllOnTools matches → rebuild all pages.
  const onDocumentsChangeRef = useRef(onDocumentsChange);
  onDocumentsChangeRef.current = onDocumentsChange;
  const rebuildAllOnToolsRef = useRef(rebuildAllOnTools);
  rebuildAllOnToolsRef.current = rebuildAllOnTools;
  const handleToolComplete = useCallback(
    (tool: string, args: Record<string, unknown>) => {
      // Handle revert — full rebuild of all pages + refresh page list
      if (tool === '__revert__') {
        setPageAudits(new Map());
        void buildPages();
        if (refetchDocOnPageChange) {
          void refetchDocConfig();
        } else {
          onDocumentsChangeRef.current?.();
        }
        return;
      }

      // Check caller-provided tools that require a full rebuild
      if (rebuildAllOnToolsRef.current?.includes(tool)) {
        setPageAudits(new Map());
        void buildPages();
        return;
      }

      switch (tool) {
        case 'writePage':
        case 'editPage': {
          const pageId = args.pageId as string | undefined;
          if (pageId) void buildPage(pageId);
          break;
        }
        case 'createPage':
        case 'deletePage':
        case 'movePage':
        case 'updatePageDetails':
          if (refetchDocOnPageChange) {
            void refetchDocConfig();
          } else {
            onDocumentsChangeRef.current?.();
          }
          break;
      }
    },
    [buildPage, buildPages, refetchDocOnPageChange, refetchDocConfig],
  );

  const handleIframeLoad = useCallback(
    (pageId: string, iframe: HTMLIFrameElement) => {
      console.log(`[page-audit] handleIframeLoad called for page "${pageId}"`);
      console.log(`[page-audit] page dimensions: ${pageWidthPx}x${pageHeightPx}px`);
      console.log(
        `[page-audit] iframe contentDocument:`,
        iframe.contentDocument ? 'exists' : 'null',
      );
      const audits = runPageAudits(iframe, { pageId, pageWidthPx, pageHeightPx });
      console.log(`[page-audit] audits for "${pageId}":`, audits);
      setPageAudits((prev) => new Map(prev).set(pageId, audits));
    },
    [pageWidthPx, pageHeightPx],
  );

  const handleAuditFix = useCallback((audit: PageAudit) => {
    sendMessageRef.current?.(addDiagnosticPrefix(audit.fixMessage, 'warning'));
  }, []);

  const handleBusyChange = useCallback(
    (busy: boolean) => {
      setIsAgentBusy(busy);
      onAgentBusyChange?.(busy);
    },
    [onAgentBusyChange],
  );

  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    void window.litho.app.getPlatform().then((p) => setIsMac(p === 'darwin'));
  }, []);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const toolbar = (
    <DocumentToolbar
      docTitle={doc.title}
      currentPage={currentPage}
      totalPages={pages.length}
      onBack={onBack}
      zoom={zoom}
      fitToWidth={fitToWidth}
      editMode={editMode}
      viewMode={viewMode}
      showAssets={doc.type !== 'design-system'}
      modKey={modKey}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onFitToWidth={handleFitToWidth}
      onToggleAssets={setViewMode}
      onToggleEditMode={toggleEditMode}
      onExport={() => setExportOpen(true)}
    />
  );

  const displayWidth = pageWidthPx * zoom;

  const hasPages = pages.length > 0;

  const emptyPlaceholder = (
    <div
      className="flex items-center justify-center py-6"
      style={{ paddingInline: VIEWER_PADDING }}
    >
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-background"
        style={{ width: pageWidthPx * zoom, height: pageHeightPx * zoom }}
      >
        <p className="text-center text-sm text-muted-foreground">
          Start the chat to build &ldquo;{doc.title}&rdquo;
        </p>
      </div>
    </div>
  );

  const pageContent = hasPages ? (
    <div
      className="flex flex-col items-center gap-6 py-6"
      style={{
        paddingInline: VIEWER_PADDING,
        minWidth: displayWidth + VIEWER_PADDING * 2,
      }}
    >
      {pages.map((page, index) => (
        <div key={page.id} className="flex flex-col items-center">
          <div className="flex flex-col gap-0.5 pb-1.5" style={{ width: displayWidth }}>
            <span className="text-xs font-medium text-muted-foreground/60">
              {index + 1}. {page.name || 'Untitled'}
            </span>
            {page.description && (
              <span className="truncate text-[11px] text-muted-foreground/40">
                {page.description}
              </span>
            )}
          </div>
          <PageFrame
            ref={(el) => setPageRef(index, el)}
            index={index}
            html={pageHtmlMap.get(page.id)}
            pageWidthPx={pageWidthPx}
            pageHeightPx={pageHeightPx}
            zoom={zoom}
            editMode={editMode}
            onIframeLoad={(iframe) => handleIframeLoad(page.id, iframe)}
          />
          <PageAuditBar
            audits={pageAudits.get(page.id) ?? []}
            displayWidth={displayWidth}
            isAgentBusy={isAgentBusy}
            onFix={handleAuditFix}
          />
        </div>
      ))}
    </div>
  ) : (
    emptyPlaceholder
  );

  const exportDialog = (
    <ExportDialog
      doc={doc}
      workspaceName={workspaceName}
      open={exportOpen}
      onOpenChange={setExportOpen}
    />
  );

  if (editMode) {
    return (
      <TooltipProvider>
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize={70} minSize={40}>
            <div className="flex h-full flex-col">
              {toolbar}
              <div className="flex min-h-0 flex-1">
                <PageSidebar
                  pages={pages}
                  currentPage={currentPage}
                  onPageClick={handleThumbnailClick}
                />

                {/* Page viewer */}
                <div ref={viewerRef} className="relative min-w-0 flex-1">
                  <div
                    ref={scrollRef}
                    className={cn(
                      'absolute inset-0 bg-neutral-200 dark:bg-neutral-900',
                      fitToWidth ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto',
                    )}
                  >
                    {pageContent}
                  </div>
                </div>
              </div>
            </div>
            {exportDialog}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={30} minSize={20}>
            <PendingChangesPanel
              changes={pendingChanges}
              onRemove={removePendingChange}
              onConfirm={confirmEdits}
              onDiscard={discardEdits}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </TooltipProvider>
    );
  }

  const chatPanel = renderChat ? (
    renderChat({
      workspaceName,
      workspaceTitle,
      onToolComplete: handleToolComplete,
      sendMessageRef,
      onBusyChange: handleBusyChange,
      onLeaveRequestChange: onAgentLeaveRequestChange ?? (() => {}),
    })
  ) : (
    <DocumentChat
      doc={doc}
      workspaceName={workspaceName}
      workspaceTitle={workspaceTitle}
      userName={userName}
      onToolComplete={handleToolComplete}
      sendMessageRef={sendMessageRef}
      onBusyChange={handleBusyChange}
      onLeaveRequestChange={onAgentLeaveRequestChange}
    />
  );

  return (
    <TooltipProvider>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={70} minSize={40}>
          <div className="flex h-full flex-col">
            {toolbar}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone for file uploads */}
            <div
              className="flex min-h-0 flex-1"
              onDragOver={(e) => {
                if (
                  !e.dataTransfer.types.includes('Files') ||
                  e.dataTransfer.types.includes('application/x-litho-asset')
                )
                  return;
                e.preventDefault();
                if (viewMode === 'preview') setViewMode('assets');
              }}
            >
              <PageSidebar
                pages={pages}
                currentPage={currentPage}
                pageAudits={pageAudits}
                onPageClick={handleThumbnailClick}
              />

              {/* Main content — preview or assets */}
              {viewMode === 'assets' ? (
                <div className="relative min-w-0 flex-1 bg-neutral-200 dark:bg-neutral-900">
                  <DocumentAssetsView workspaceName={workspaceName} docId={doc.id} />
                </div>
              ) : (
                <div ref={viewerRef} className="relative min-w-0 flex-1">
                  <div
                    ref={scrollRef}
                    className={cn(
                      'absolute inset-0 bg-neutral-200 dark:bg-neutral-900',
                      fitToWidth ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto',
                    )}
                  >
                    {pageContent}
                  </div>
                </div>
              )}
            </div>
          </div>
          {exportDialog}
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={30} minSize={20}>
          {chatPanel}
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function DocumentToolbar({
  docTitle,
  currentPage,
  totalPages,
  onBack,
  zoom,
  fitToWidth,
  editMode,
  viewMode,
  showAssets,
  modKey,
  onZoomIn,
  onZoomOut,
  onFitToWidth,
  onToggleAssets,
  onToggleEditMode,
  onExport,
}: {
  docTitle: string;
  currentPage: number;
  totalPages: number;
  onBack: () => void;
  zoom: number;
  fitToWidth: boolean;
  editMode: boolean;
  viewMode: 'preview' | 'assets';
  showAssets: boolean;
  modKey: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToWidth: () => void;
  onToggleAssets: (mode: 'preview' | 'assets') => void;
  onToggleEditMode: () => void;
  onExport: () => void;
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2">
      <Button variant="ghost" size="icon-sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="truncate text-base font-semibold">{docTitle}</span>
      {totalPages > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">
          Page {currentPage + 1} of {totalPages}
        </span>
      )}

      {showAssets && (
        <>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={viewMode}
            onValueChange={(v) => {
              if (v) onToggleAssets(v as 'preview' | 'assets');
            }}
          >
            <ToggleGroupItem value="preview" className="h-7 text-xs">
              Preview
            </ToggleGroupItem>
            <ToggleGroupItem value="assets" className="h-7 text-xs">
              Assets
            </ToggleGroupItem>
          </ToggleGroup>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onZoomOut}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Zoom out <Kbd>{modKey}</Kbd>
            <Kbd>-</Kbd>
          </TooltipContent>
        </Tooltip>

        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onZoomIn}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Zoom in <Kbd>{modKey}</Kbd>
            <Kbd>+</Kbd>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={fitToWidth ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={onFitToWidth}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Fit to width <Kbd>{modKey}</Kbd>
            <Kbd>0</Kbd>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editMode ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={onToggleEditMode}
            >
              <Pencil className={cn('h-3.5 w-3.5', editMode && 'text-primary')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{editMode ? 'Exit edit mode' : 'Edit mode'}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export document</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page sidebar
// ---------------------------------------------------------------------------

function PageSidebar({
  pages,
  currentPage,
  pageAudits,
  onPageClick,
}: {
  pages: { id: string; name: string }[];
  currentPage: number;
  pageAudits?: Map<string, unknown[]>;
  onPageClick: (index: number) => void;
}) {
  return (
    <div className="flex w-48 min-h-0 shrink-0 flex-col border-r bg-card">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-3">
          {pages.length > 0 ? (
            pages.map((page, index) => (
              <PageListItem
                key={page.id}
                index={index}
                name={page.name}
                isActive={currentPage === index}
                hasAuditWarning={(pageAudits?.get(page.id)?.length ?? 0) > 0}
                onClick={onPageClick}
              />
            ))
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">Empty</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar page list item
// ---------------------------------------------------------------------------

function PageListItem({
  index,
  name,
  isActive,
  hasAuditWarning,
  onClick,
}: {
  index: number;
  name: string;
  isActive: boolean;
  hasAuditWarning: boolean;
  onClick: (index: number) => void;
}): React.JSX.Element {
  const itemRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll active item into view in the sidebar
  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isActive]);

  return (
    <button
      ref={itemRef}
      type="button"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md border-l-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/50',
        isActive
          ? 'border-primary bg-muted'
          : hasAuditWarning
            ? 'border-amber-500 bg-amber-500/5'
            : 'border-transparent',
      )}
      onClick={() => onClick(index)}
    >
      <span
        className={cn(
          'shrink-0 text-xs tabular-nums',
          isActive
            ? 'font-semibold text-primary'
            : hasAuditWarning
              ? 'text-amber-500'
              : 'text-muted-foreground',
        )}
      >
        {index + 1}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs',
          isActive
            ? 'font-medium text-foreground'
            : name
              ? 'text-muted-foreground'
              : 'text-muted-foreground/50 italic',
        )}
      >
        {name || 'Untitled'}
      </span>
      {hasAuditWarning && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page frame
// ---------------------------------------------------------------------------

const PageFrame = forwardRef<
  HTMLDivElement,
  {
    index: number;
    html: string | undefined;
    pageWidthPx: number;
    pageHeightPx: number;
    zoom: number;
    editMode?: boolean;
    onIframeLoad?: (iframe: HTMLIFrameElement) => void;
  }
>(function PageFrame(
  { index, html, pageWidthPx, pageHeightPx, zoom, editMode = false, onIframeLoad },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const displayWidth = pageWidthPx * zoom;
  const displayHeight = pageHeightPx * zoom;

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    console.log(`[page-audit] iframe onLoad fired, index=${index}`, {
      hasIframe: !!iframe,
      hasCallback: !!onIframeLoad,
    });
    if (!iframe || !onIframeLoad) return;
    // Double rAF to wait for CSR pages where React renders async after script load
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onIframeLoad(iframe);
      });
    });
  }, [onIframeLoad, index]);

  return (
    <div
      ref={ref}
      data-page-index={index}
      className="relative shrink-0 overflow-hidden rounded border bg-white shadow-sm"
      style={{ width: displayWidth, height: displayHeight }}
    >
      {html ? (
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title={`Page ${index + 1}`}
          scrolling="no"
          className={cn(
            'absolute top-0 left-0 origin-top-left',
            !editMode && 'pointer-events-none',
          )}
          style={{
            width: pageWidthPx,
            height: pageHeightPx,
            transform: `scale(${zoom})`,
            border: 'none',
          }}
          tabIndex={editMode ? 0 : -1}
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleLoad}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
});
