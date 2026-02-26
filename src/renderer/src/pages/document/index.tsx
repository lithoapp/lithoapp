import * as Sentry from '@sentry/electron/renderer';
import { ArrowLeft, Download, Maximize2, Minus, Pencil, Plus } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ManifestDocument } from '@/hooks/use-workspace-manifest';
import { cn } from '@/lib/utils';
import { DocumentChat } from './document-chat';
import { ExportDialog } from './export-dialog';

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const SIDEBAR_PADDING = 16;
const VIEWER_PADDING = 40;

interface DocumentPageProps {
  doc: ManifestDocument;
  serverUrl: string;
  workspacePath: string;
  onBack: () => void;
  onManifestChange?: () => void;
  userName?: string;
}

export function DocumentPage({
  doc,
  serverUrl,
  workspacePath,
  onBack,
  onManifestChange,
  userName,
}: DocumentPageProps): React.JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [fitToWidth, setFitToWidth] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [errorPages, setErrorPages] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Forward page iframe errors to Sentry
  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      if (!event.origin.startsWith('http://localhost')) return;
      const data = event.data;
      if (!data || data.type !== 'litho:page-error') return;

      setErrorPages((prev) => new Set(prev).add(String(data.page)));

      const error = new Error(String(data.message));
      if (typeof data.stack === 'string') {
        error.stack = data.stack;
      }

      Sentry.withScope((scope) => {
        scope.setTag('component', 'page-renderer');
        scope.setExtras({
          doc: data.doc,
          page: data.page,
          isCompilationError: data.isCompilationError ?? false,
        });
        Sentry.captureException(error);
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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

  // When the agent edits a file after an error, bump refreshKey to force
  // iframe reloads (HMR can't recover from compilation errors).
  // When document.json changes, refetch the manifest so new/deleted pages
  // appear in the sidebar immediately.
  const errorPagesRef = useRef(errorPages);
  errorPagesRef.current = errorPages;
  const onManifestChangeRef = useRef(onManifestChange);
  onManifestChangeRef.current = onManifestChange;
  const handleFileEdit = useCallback((filePath: string) => {
    if (errorPagesRef.current.size > 0) {
      setRefreshKey((k) => k + 1);
      setErrorPages(new Set());
    }
    if (filePath.endsWith('document.json')) {
      onManifestChangeRef.current?.();
    }
  }, []);

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
          pageId={pageId}
          index={index}
          slug={doc.slug}
          serverUrl={serverUrl}
          pageWidthPx={pageWidthPx}
          pageHeightPx={pageHeightPx}
          zoom={zoom}
          editMode={editMode}
          hasError={errorPages.has(pageId)}
          refreshKey={refreshKey}
        />
      ))}
    </div>
  );

  const exportDialog = (
    <ExportDialog doc={doc} serverUrl={serverUrl} open={exportOpen} onOpenChange={setExportOpen} />
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
                        pageId={pageId}
                        index={index}
                        slug={doc.slug}
                        serverUrl={serverUrl}
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
            workspacePath={workspacePath}
            userName={userName}
            onFileEdit={handleFileEdit}
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
  pageId,
  index,
  slug,
  serverUrl,
  pageWidthPx,
  pageHeightPx,
  isActive,
  onClick,
}: {
  pageId: string;
  index: number;
  slug: string;
  serverUrl: string;
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
  const url = `${serverUrl}/${slug}/${pageId}`;

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
        {containerWidth > 0 && (
          <iframe
            src={url}
            title={`Page ${index + 1}`}
            className="pointer-events-none absolute top-0 left-0 origin-top-left"
            style={{
              width: pageWidthPx,
              height: pageHeightPx,
              transform: `scale(${scale})`,
              border: 'none',
            }}
            tabIndex={-1}
          />
        )}
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
    pageId: string;
    index: number;
    slug: string;
    serverUrl: string;
    pageWidthPx: number;
    pageHeightPx: number;
    zoom: number;
    editMode?: boolean;
    hasError?: boolean;
    refreshKey?: number;
  }
>(function PageFrame(
  {
    pageId,
    index,
    slug,
    serverUrl,
    pageWidthPx,
    pageHeightPx,
    zoom,
    editMode = false,
    hasError = false,
    refreshKey = 0,
  },
  ref,
) {
  const displayWidth = pageWidthPx * zoom;
  const displayHeight = pageHeightPx * zoom;
  const base = `${serverUrl}/${slug}/${pageId}`;
  const params = new URLSearchParams();
  if (editMode) params.set('edit', '');
  if (refreshKey > 0) params.set('v', String(refreshKey));
  const qs = params.toString();
  const url = qs ? `${base}?${qs}` : base;
  const interactive = editMode || hasError;

  return (
    <div
      ref={ref}
      data-page-index={index}
      className="relative shrink-0 overflow-hidden rounded border bg-white shadow-sm"
      style={{ width: displayWidth, height: displayHeight }}
    >
      <iframe
        src={url}
        title={`Page ${index + 1}`}
        className={cn(
          'absolute top-0 left-0 origin-top-left',
          !interactive && 'pointer-events-none',
        )}
        style={{
          width: pageWidthPx,
          height: pageHeightPx,
          transform: `scale(${zoom})`,
          border: 'none',
        }}
        tabIndex={interactive ? 0 : -1}
      />
    </div>
  );
});
