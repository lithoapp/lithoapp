import { ArrowLeft, Copy, MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { useDesignSystem } from '@/hooks/use-design-system';
import type { DesignSystem } from '@/lib/design-system-types';
import { DesignSystemChat } from '../design-system/design-system-chat';
import {
  ColorsPages,
  CoverPage,
  GradientsPage,
  RadiusShadowsPage,
  SpacingPage,
  TransitionsPage,
  TypeScalePage,
  TypographyFamiliesPage,
  ZIndexPage,
} from './doc-content-pages';
import { PageThumbnail } from './page-shell';
import { buildPageDefs } from './utils';

interface DesignSystemDocPageProps {
  workspaceName: string;
  workspacePath: string | null;
  onBack: () => void;
}

export function DesignSystemDocPage({
  workspaceName,
  workspacePath,
  onBack,
}: DesignSystemDocPageProps): React.JSX.Element {
  const { designSystem, loading, error, refetch } = useDesignSystem(workspaceName);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isScrollingRef = useRef(false);
  const visiblePagesRef = useRef<Set<string>>(new Set());
  const [scale, setScale] = useState(1);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const pageDefs = designSystem ? buildPageDefs(designSystem) : [];

  // Fit-to-width scaling
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setScale((width - 80) / 794);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Current page tracking — re-attach observer when page count changes after data loads
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pageDefs.length === 0) return;
    visiblePagesRef.current.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return;
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-page-id');
          if (!id) continue;
          if (entry.isIntersecting) visiblePagesRef.current.add(id);
          else visiblePagesRef.current.delete(id);
        }
        // Pick the topmost visible page by stable DOM position
        let topmostId: string | null = null;
        let topmostTop = Infinity;
        for (const id of visiblePagesRef.current) {
          const el = pageRefs.current.get(id);
          if (!el) continue;
          if (el.offsetTop < topmostTop) {
            topmostTop = el.offsetTop;
            topmostId = id;
          }
        }
        if (topmostId) setActivePageId(topmostId);
      },
      { root, threshold: 0 },
    );
    for (const el of pageRefs.current.values()) {
      observer.observe(el);
    }
    return () => {
      observer.disconnect();
      visiblePagesRef.current.clear();
    };
  }, [pageDefs.length]);

  const setRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) pageRefs.current.set(id, el);
    else pageRefs.current.delete(id);
  }, []);

  const scrollToPage = useCallback((id: string) => {
    const el = pageRefs.current.get(id);
    if (!el) return;
    isScrollingRef.current = true;
    setActivePageId(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const container = scrollRef.current;
    if (container) {
      container.addEventListener(
        'scrollend',
        () => {
          isScrollingRef.current = false;
        },
        { once: true },
      );
    }
  }, []);

  const handleToolComplete = useCallback(
    (tool: string, _args: Record<string, unknown>) => {
      if (tool === 'writeMainCss' || tool === 'editMainCss') {
        void refetch();
      }
    },
    [refetch],
  );

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Left: toolbar + sidebar + viewer */}
      <ResizablePanel defaultSize={65} minSize={40}>
        <div className="flex h-full flex-col">
          {/* Toolbar */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <Button variant="ghost" size="icon-sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="truncate text-base font-semibold">Design System</span>
          </div>

          {/* Sidebar + viewer */}
          <div className="flex min-h-0 flex-1">
            {/* Thumbnail sidebar — only when loaded */}
            {designSystem && (
              <div className="w-48 shrink-0 border-r">
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-0.5 py-2">
                    {pageDefs.map((page, index) => (
                      <PageThumbnail
                        key={page.id}
                        page={page}
                        index={index}
                        isActive={activePageId === page.id}
                        onClick={scrollToPage}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Viewer */}
            <div ref={viewerRef} className="relative flex-1">
              <div
                ref={scrollRef}
                className="absolute inset-0 overflow-auto bg-neutral-200 dark:bg-neutral-900"
              >
                {loading && (
                  <div className="flex h-full items-center justify-center">
                    <Spinner />
                  </div>
                )}
                {error && !designSystem && (
                  <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
                    <p className="text-base font-medium text-destructive">
                      styles.css has a syntax error
                    </p>
                    <pre className="w-full max-w-lg whitespace-pre-wrap rounded-md bg-muted p-4 text-xs text-foreground">
                      {error}
                    </pre>
                    <Button
                      variant="outline"
                      className="h-10 px-4 text-sm"
                      onClick={() => void navigator.clipboard.writeText(error)}
                    >
                      <Copy className="mr-1.5 h-4 w-4" />
                      Copy error
                    </Button>
                  </div>
                )}
                {designSystem && (
                  <DocViewer
                    designSystem={designSystem}
                    workspaceName={workspaceName}
                    scale={scale}
                    setRef={setRef}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right: chat — full height */}
      <ResizablePanel defaultSize={35} minSize={20}>
        {workspaceName && workspacePath ? (
          <DesignSystemChat
            workspaceName={workspaceName}
            workspacePath={workspacePath}
            onToolComplete={handleToolComplete}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="size-8" />
            <p className="text-base font-semibold">AI Chat</p>
            <p className="text-sm">Open a workspace to start chatting</p>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function DocViewer({
  designSystem,
  workspaceName,
  scale,
  setRef,
}: {
  designSystem: DesignSystem;
  workspaceName: string;
  scale: number;
  setRef: (id: string, el: HTMLElement | null) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div style={{ zoom: scale }}>
        <div className="flex flex-col gap-8">
          <section data-page-id="cover" ref={(el) => setRef('cover', el)}>
            <CoverPage designSystem={designSystem} workspaceName={workspaceName} />
          </section>
          <ColorsPages designSystem={designSystem} setRef={setRef} />
          {designSystem.gradients.length > 0 && (
            <section data-page-id="gradients" ref={(el) => setRef('gradients', el)}>
              <GradientsPage gradients={designSystem.gradients} />
            </section>
          )}
          <section data-page-id="typefaces" ref={(el) => setRef('typefaces', el)}>
            <TypographyFamiliesPage designSystem={designSystem} />
          </section>
          <section data-page-id="type-scale" ref={(el) => setRef('type-scale', el)}>
            <TypeScalePage designSystem={designSystem} />
          </section>
          <section data-page-id="spacing" ref={(el) => setRef('spacing', el)}>
            <SpacingPage designSystem={designSystem} />
          </section>
          <section data-page-id="radius-shadows" ref={(el) => setRef('radius-shadows', el)}>
            <RadiusShadowsPage designSystem={designSystem} />
          </section>
          {designSystem.transitions.length > 0 && (
            <section data-page-id="transitions" ref={(el) => setRef('transitions', el)}>
              <TransitionsPage transitions={designSystem.transitions} />
            </section>
          )}
          {designSystem.zIndex.length > 0 && (
            <section data-page-id="z-index" ref={(el) => setRef('z-index', el)}>
              <ZIndexPage zIndex={designSystem.zIndex} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
