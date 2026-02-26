import * as Sentry from '@sentry/electron/renderer';
import { ArrowLeft, Download, Loader2, Maximize2, Minus, Pencil, Plus } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DocumentInfo } from '../../../../shared/types';
import { DocumentChat } from './document-chat';
import { ExportDialog } from './export-dialog';

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const SIDEBAR_PADDING = 16;
const VIEWER_PADDING = 40;

interface DocumentPageProps {
  doc: DocumentInfo;
  workspaceName: string;
  workspacePath: string;
  onBack: () => void;
  onDocumentsChange?: () => void;
  userName?: string;
}

export function DocumentPage({
  doc,
  workspaceName,
  workspacePath,
  onBack,
  onDocumentsChange,
  userName,
}: DocumentPageProps): React.JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [fitToWidth, setFitToWidth] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pageHtmlMap, setPageHtmlMap] = useState<Map<string, string>>(new Map());

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const viewerRef = useRef<HTMLDivElement>(null);

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

  // IntersectionObserver for current page detection
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach observer when pages or zoom change
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          const idx = Number(entry.target.getAttribute('data-page-index'));
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
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
  }, [doc.pages.length, zoom]);

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
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Build page HTML lazily: current page first, then remaining pages
  const buildPages = useCallback(async () => {
    const pages = doc.pages;
    if (pages.length === 0) return;

    // Build current page first for instant display
    const firstPage = pages[currentPage] ?? pages[0];
    try {
      const result = await window.litho.renderer.build(workspaceName, doc.slug, firstPage);
      if (result.ok) {
        setPageHtmlMap((prev) => new Map(prev).set(firstPage, result.data.html));
      } else {
        console.error(`[document] Build failed for ${firstPage}:`, result.error);
      }
    } catch (err) {
      console.error(`[document] Build failed for ${firstPage}:`, err);
      Sentry.captureException(err);
    }

    // Build remaining pages in background
    for (const pageId of pages) {
      if (pageId === firstPage) continue;
      try {
        const result = await window.litho.renderer.build(workspaceName, doc.slug, pageId);
        if (result.ok) {
          setPageHtmlMap((prev) => new Map(prev).set(pageId, result.data.html));
        } else {
          console.error(`[document] Build failed for ${pageId}:`, result.error);
        }
      } catch (err) {
        console.error(`[document] Build failed for ${pageId}:`, err);
        Sentry.captureException(err);
      }
    }
  }, [workspaceName, doc.slug, doc.pages, currentPage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: build pages on mount and when doc changes
  useEffect(() => {
    setPageHtmlMap(new Map());
    void buildPages();
  }, [workspaceName, doc.slug, doc.pages]);

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
      try {
        const result = await window.litho.renderer.build(workspaceName, doc.slug, pageId);
        if (result.ok) {
          setPageHtmlMap((prev) => new Map(prev).set(pageId, result.data.html));
        }
      } catch (err) {
        console.error(`[document] Build failed for ${pageId}:`, err);
        Sentry.captureException(err);
      }
    },
    [workspaceName, doc.slug],
  );

  // Handle completed litho tool calls.
  // writePage/editPage → rebuild the specific page only.
  // createPage/deletePage → refetch doc list (parent updates doc.pages,
  //   which triggers the useEffect that rebuilds all pages).
  const onDocumentsChangeRef = useRef(onDocumentsChange);
  onDocumentsChangeRef.current = onDocumentsChange;
  const handleToolComplete = useCallback(
    (tool: string, args: Record<string, unknown>) => {
      switch (tool) {
        case 'writePage':
        case 'editPage': {
          const pageId = args.pageId as string | undefined;
          if (pageId) void buildPage(pageId);
          break;
        }
        case 'createPage':
        case 'deletePage':
          onDocumentsChangeRef.current?.();
          break;
      }
    },
    [buildPage],
  );

  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    void window.litho.app.getPlatform().then((p) => setIsMac(p === 'darwin'));
  }, []);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const toolbar = (
    <DocumentToolbar
      docTitle={doc.title}
      onBack={onBack}
      zoom={zoom}
      fitToWidth={fitToWidth}
      editMode={editMode}
      modKey={modKey}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onFitToWidth={handleFitToWidth}
      onToggleEditMode={() => setEditMode((m) => !m)}
      onExport={() => setExportOpen(true)}
    />
  );

  const pages = (
    <div
      className="flex flex-col items-center gap-6 py-6"
      style={{ paddingInline: VIEWER_PADDING }}
    >
      {doc.pages.map((pageId, index) => (
        <PageFrame
          key={pageId}
          ref={(el) => setPageRef(index, el)}
          index={index}
          html={pageHtmlMap.get(pageId)}
          pageWidthPx={pageWidthPx}
          pageHeightPx={pageHeightPx}
          zoom={zoom}
          editMode={editMode}
        />
      ))}
    </div>
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
        <div className="flex h-full flex-col">
          {toolbar}
          <div ref={viewerRef} className="relative min-w-0 flex-1">
            <div
              ref={scrollRef}
              className="absolute inset-0 overflow-auto bg-neutral-200 dark:bg-neutral-900"
            >
              {pages}
            </div>
          </div>
          {exportDialog}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={70} minSize={40}>
          <div className="flex h-full flex-col">
            {toolbar}
            <div className="flex min-h-0 flex-1">
              {/* Sidebar */}
              <div className="w-48 shrink-0 border-r">
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-2 p-3">
                    {doc.pages.map((pageId, index) => (
                      <PageThumbnail
                        key={pageId}
                        index={index}
                        html={pageHtmlMap.get(pageId)}
                        pageWidthPx={pageWidthPx}
                        pageHeightPx={pageHeightPx}
                        isActive={currentPage === index}
                        onClick={handleThumbnailClick}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Main viewer */}
              <div ref={viewerRef} className="relative min-w-0 flex-1">
                <div
                  ref={scrollRef}
                  className="absolute inset-0 overflow-auto bg-neutral-200 dark:bg-neutral-900"
                >
                  {pages}
                </div>
              </div>
            </div>
          </div>
          {exportDialog}
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={30} minSize={20}>
          <DocumentChat
            doc={doc}
            workspaceName={workspaceName}
            workspacePath={workspacePath}
            userName={userName}
            onToolComplete={handleToolComplete}
          />
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
  onBack,
  zoom,
  fitToWidth,
  editMode,
  modKey,
  onZoomIn,
  onZoomOut,
  onFitToWidth,
  onToggleEditMode,
  onExport,
}: {
  docTitle: string;
  onBack: () => void;
  zoom: number;
  fitToWidth: boolean;
  editMode: boolean;
  modKey: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToWidth: () => void;
  onToggleEditMode: () => void;
  onExport: () => void;
}): React.JSX.Element {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
      <Button variant="ghost" size="icon-sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="truncate text-base font-semibold">{docTitle}</span>

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
// Thumbnails
// ---------------------------------------------------------------------------

function PageThumbnail({
  index,
  html,
  pageWidthPx,
  pageHeightPx,
  isActive,
  onClick,
}: {
  index: number;
  html: string | undefined;
  pageWidthPx: number;
  pageHeightPx: number;
  isActive: boolean;
  onClick: (index: number) => void;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const thumbWidth = containerWidth || 192 - SIDEBAR_PADDING * 2;
  const scale = thumbWidth / pageWidthPx;
  const thumbHeight = pageHeightPx * scale;

  return (
    <button
      type="button"
      className={cn(
        'group flex flex-col items-center gap-1 rounded-lg p-1 text-left transition-colors hover:bg-muted/50',
        isActive && 'bg-muted',
      )}
      onClick={() => onClick(index)}
    >
      <div
        ref={containerRef}
        className={cn(
          'relative w-full overflow-hidden rounded border bg-white',
          isActive && 'border-primary ring-1 ring-primary',
        )}
        style={{
          height: thumbHeight || 'auto',
          aspectRatio: containerWidth ? undefined : `${pageWidthPx} / ${pageHeightPx}`,
        }}
      >
        {containerWidth > 0 && html ? (
          <iframe
            srcDoc={html}
            title={`Page ${index + 1}`}
            className="pointer-events-none absolute top-0 left-0 origin-top-left"
            style={{
              width: pageWidthPx,
              height: pageHeightPx,
              transform: `scale(${scale})`,
              border: 'none',
            }}
            tabIndex={-1}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : containerWidth > 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      <span className={cn('text-xs', isActive ? 'text-foreground' : 'text-muted-foreground')}>
        {index + 1}
      </span>
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
  }
>(function PageFrame({ index, html, pageWidthPx, pageHeightPx, zoom, editMode = false }, ref) {
  const displayWidth = pageWidthPx * zoom;
  const displayHeight = pageHeightPx * zoom;

  return (
    <div
      ref={ref}
      data-page-index={index}
      className="relative shrink-0 overflow-hidden rounded border bg-white shadow-sm"
      style={{ width: displayWidth, height: displayHeight }}
    >
      {html ? (
        <iframe
          srcDoc={html}
          title={`Page ${index + 1}`}
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
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
});
