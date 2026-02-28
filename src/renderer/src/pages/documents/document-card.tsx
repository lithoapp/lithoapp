import {
  Copy,
  Download,
  FileText,
  FolderInput,
  FolderMinus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DocumentInfo } from '../../../../shared/types';

/** Fixed thumbnail container height in px. */
const THUMB_HEIGHT = 180;

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(`${isoDate}Z`).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

interface DocumentCardProps {
  doc: DocumentInfo;
  workspaceName: string;
  isDeleting: boolean;
  onDelete: (e: React.MouseEvent, slug: string) => void;
  onRename: (docId: string) => void;
  onDuplicate: (docId: string) => void;
  onExport: (docId: string) => void;
  onAssignFolder: (slug: string) => void;
  onRemoveFromFolder: (slug: string) => void;
  onClick: () => void;
}

export function DocumentCard({
  doc,
  workspaceName,
  isDeleting,
  onDelete,
  onRename,
  onDuplicate,
  onExport,
  onAssignFolder,
  onRemoveFromFolder,
  onClick,
}: DocumentCardProps): React.JSX.Element {
  const sizeLabel =
    doc.size.unit === 'mm'
      ? `${doc.size.width} × ${doc.size.height} mm`
      : `${doc.size.width} × ${doc.size.height} px`;

  const pageCountLabel =
    doc.pages.length === 0
      ? 'Empty'
      : `${doc.pages.length} ${doc.pages.length === 1 ? 'page' : 'pages'}`;

  const metaParts: string[] = [pageCountLabel, sizeLabel];
  if (doc.updatedAt) {
    metaParts.push(formatRelativeTime(doc.updatedAt));
  }

  return (
    <button
      type="button"
      draggable
      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/40"
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', doc.id);
        e.dataTransfer.effectAllowed = 'move';

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
          '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
          '<polyline points="14 2 14 8 20 8"/>' +
          '</svg>' +
          `<span style="overflow:hidden;text-overflow:ellipsis">${doc.title}</span>`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 14, 16);
        requestAnimationFrame(() => document.body.removeChild(ghost));
      }}
      onClick={onClick}
    >
      <CardThumbnail doc={doc} workspaceName={workspaceName} />

      <div className="relative flex flex-col gap-1 px-4 py-3">
        <p className="truncate text-base font-semibold">{doc.title}</p>
        <p className="truncate text-sm text-muted-foreground">{metaParts.join(' · ')}</p>

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
                  onRename(doc.id);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(doc.id);
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onExport(doc.id);
                }}
              >
                <Download className="mr-2 h-3.5 w-3.5" />
                Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onAssignFolder(doc.id);
                }}
              >
                <FolderInput className="mr-2 h-3.5 w-3.5" />
                Move to Folder
              </DropdownMenuItem>
              {doc.folder && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromFolder(doc.id);
                  }}
                >
                  <FolderMinus className="mr-2 h-3.5 w-3.5" />
                  Move to Top Level
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => onDelete(e, doc.id)}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                )}
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail with lazy iframe rendering
// ---------------------------------------------------------------------------

function CardThumbnail({
  doc,
  workspaceName,
}: {
  doc: DocumentInfo;
  workspaceName: string;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);

  // IntersectionObserver: only build when card is visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Build the first page when visible
  const buildFirstPage = useCallback(async () => {
    const firstPage = doc.pages[0];
    if (!firstPage) return;
    setIsBuilding(true);
    try {
      const result = await window.litho.renderer.build(workspaceName, doc.id, firstPage.id);
      if (result.ok) {
        setHtml(result.data.html);
      }
    } catch {
      // Silently fail — we'll show the placeholder
    } finally {
      setIsBuilding(false);
    }
  }, [workspaceName, doc.id, doc.pages]);

  useEffect(() => {
    if (isVisible && doc.pages.length > 0 && html === null && !isBuilding) {
      void buildFirstPage();
    }
  }, [isVisible, doc.pages.length, html, isBuilding, buildFirstPage]);

  const pageWidthPx = doc.size.width * (doc.size.unit === 'mm' ? 3.7795 : 1);
  const pageHeightPx = doc.size.height * (doc.size.unit === 'mm' ? 3.7795 : 1);

  // Scale to fit within THUMB_HEIGHT
  const scale = THUMB_HEIGHT / pageHeightPx;
  const scaledWidth = pageWidthPx * scale;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center overflow-hidden border-b bg-muted/30"
      style={{ height: THUMB_HEIGHT }}
    >
      {html ? (
        <div
          className="relative overflow-hidden rounded-sm"
          style={{ width: scaledWidth, height: THUMB_HEIGHT }}
        >
          <iframe
            srcDoc={html}
            title={`${doc.title} preview`}
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
        </div>
      ) : isBuilding ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      ) : (
        <div
          className="flex items-center justify-center rounded-sm border border-muted-foreground/20 bg-background"
          style={{
            aspectRatio: `${doc.size.width} / ${doc.size.height}`,
            height: '60%',
            maxWidth: '80%',
          }}
        >
          <FileText className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}
    </div>
  );
}
