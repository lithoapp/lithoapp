import { FileText, Image, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { DocumentInfo, ExportFormat, ExportProgress } from '../../../../shared/types';

interface ExportDialogProps {
  doc: DocumentInfo;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  { value: 'pdf', label: 'PDF', description: 'Multi-page document', icon: FileText },
  { value: 'png', label: 'PNG', description: 'Lossless images', icon: Image },
  { value: 'jpg', label: 'JPG', description: 'Compressed images', icon: Image },
];

const DPI_OPTIONS = [
  { value: 72, label: '72', description: 'Screen' },
  { value: 150, label: '150', description: 'Medium' },
  { value: 300, label: '300', description: 'Print' },
] as const;

function getQualityLabel(quality: number): string {
  if (quality >= 95) return 'Maximum';
  if (quality >= 85) return 'High';
  return 'Good';
}

function formatPageSize(size: DocumentInfo['size']): string {
  if (size.unit === 'mm') {
    return `${size.width} x ${size.height} mm`;
  }
  return `${size.width} x ${size.height} px`;
}

export function ExportDialog({
  doc,
  workspaceName,
  open,
  onOpenChange,
}: ExportDialogProps): React.JSX.Element {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const pageIds = doc.pages.map((p) => p.id);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(() => new Set(pageIds));
  const [dpi, setDpi] = useState(150);
  const [jpgQuality, setJpgQuality] = useState(90);
  const [exportStatus, setExportStatus] = useState<ExportProgress['status']>('idle');
  const [progress, setProgress] = useState<ExportProgress>({
    status: 'idle',
    current: 0,
    total: 0,
  });
  const [savePath, setSavePath] = useState<string | null>(null);

  const isImage = format !== 'pdf';
  const isMmBased = doc.size.unit === 'mm';
  const isExporting = exportStatus === 'exporting';

  useEffect(() => {
    if (open) {
      setFormat('pdf');
      setSelectedPages(new Set(doc.pages.map((p) => p.id)));
      setDpi(150);
      setJpgQuality(90);
      setExportStatus('idle');
      setProgress({ status: 'idle', current: 0, total: 0 });
      setSavePath(null);
    }
  }, [open, doc.pages]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = window.litho.export.onProgress((data: ExportProgress) => {
      setProgress(data);
      setExportStatus(data.status);

      if (data.status === 'done') {
        toast.success('Document exported successfully', {
          action: savePath
            ? {
                label: 'Open in folder',
                onClick: () => void window.litho.shell.showItemInFolder(savePath),
              }
            : undefined,
        });
        onOpenChange(false);
      } else if (data.status === 'error') {
        toast.error(data.error ?? 'Export failed');
        onOpenChange(false);
      }
    });
    return unsubscribe;
  }, [open, onOpenChange, savePath]);

  const allSelected = selectedPages.size === doc.pages.length;
  const someSelected = selectedPages.size > 0 && !allSelected;

  const handleSelectAll = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (checked === true) {
        setSelectedPages(new Set(doc.pages.map((p) => p.id)));
      } else {
        setSelectedPages(new Set());
      }
    },
    [doc.pages],
  );

  const handleTogglePage = useCallback((pageId: string, checked: boolean | 'indeterminate') => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (checked === true) {
        next.add(pageId);
      } else {
        next.delete(pageId);
      }
      return next;
    });
  }, []);

  const canExport = useMemo(() => {
    if (isImage && selectedPages.size === 0) return false;
    return true;
  }, [isImage, selectedPages.size]);

  const handleExport = useCallback(async () => {
    const pages = isImage ? pageIds.filter((id) => selectedPages.has(id)) : pageIds;
    const isZip = isImage && pages.length > 1;

    const savePath = await window.litho.export.saveDialog({
      format,
      workspaceSlug: workspaceName,
      documentId: doc.id,
      isZip,
    });
    if (!savePath) return;

    setSavePath(savePath);
    setExportStatus('exporting');

    try {
      await window.litho.export.start({
        format,
        workspaceName,
        docId: doc.id,
        title: doc.title,
        pages,
        size: doc.size,
        dpi,
        jpgQuality,
        savePath,
      });
    } catch {
      // Error is handled via progress event
    }
  }, [format, doc, workspaceName, isImage, selectedPages, dpi, jpgQuality, pageIds]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (isExporting) return;
      onOpenChange(nextOpen);
    },
    [isExporting, onOpenChange],
  );

  const progressPercent =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const exportPageCount = isImage ? selectedPages.size : doc.pages.length;

  const exportButtonLabel = `Export ${exportPageCount} ${exportPageCount === 1 ? 'page' : 'pages'} as ${format.toUpperCase()}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isExporting}>
        {isExporting ? (
          <ExportingView
            format={format}
            current={progress.current}
            total={progress.total}
            percent={progressPercent}
          />
        ) : (
          <ConfigurationView
            doc={doc}
            format={format}
            onFormatChange={setFormat}
            isMmBased={isMmBased}
            selectedPages={selectedPages}
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAll={handleSelectAll}
            onTogglePage={handleTogglePage}
            dpi={dpi}
            onDpiChange={setDpi}
            jpgQuality={jpgQuality}
            onJpgQualityChange={setJpgQuality}
            canExport={canExport}
            onExport={handleExport}
            exportButtonLabel={exportButtonLabel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExportingView({
  format,
  current,
  total,
  percent,
}: {
  format: ExportFormat;
  current: number;
  total: number;
  percent: number;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <DialogTitle className="text-center">Exporting as {format.toUpperCase()}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Rendering page {Math.min(current + 1, total)} of {total}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Progress value={percent} />
        <p className="text-center text-xs tabular-nums text-muted-foreground">{percent}%</p>
      </div>
    </div>
  );
}

function ConfigurationView({
  doc,
  format,
  onFormatChange,
  isMmBased,
  selectedPages,
  allSelected,
  someSelected,
  onSelectAll,
  onTogglePage,
  dpi,
  onDpiChange,
  jpgQuality,
  onJpgQualityChange,
  canExport,
  onExport,
  exportButtonLabel,
}: {
  doc: DocumentInfo;
  format: ExportFormat;
  onFormatChange: (f: ExportFormat) => void;
  isMmBased: boolean;
  selectedPages: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (checked: boolean | 'indeterminate') => void;
  onTogglePage: (pageId: string, checked: boolean | 'indeterminate') => void;
  dpi: number;
  onDpiChange: (dpi: number) => void;
  jpgQuality: number;
  onJpgQualityChange: (q: number) => void;
  canExport: boolean;
  onExport: () => void;
  exportButtonLabel: string;
}): React.JSX.Element {
  const isImage = format !== 'pdf';

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export &ldquo;{doc.title}&rdquo;</DialogTitle>
        <DialogDescription>
          {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'} &middot;{' '}
          {formatPageSize(doc.size)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5">
        {/* Format selector cards */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm">Format</Label>
          <div className="grid grid-cols-3 gap-2">
            {FORMAT_OPTIONS.map((opt) => {
              const isSelected = format === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onFormatChange(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-foreground/20 hover:bg-muted/50',
                  )}
                >
                  <Icon
                    className={cn('h-5 w-5', isSelected ? 'text-primary' : 'text-muted-foreground')}
                  />
                  <span className={cn('text-sm font-medium', isSelected && 'text-primary')}>
                    {opt.label}
                  </span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Image-specific options */}
        {isImage && (
          <ImageOptions
            doc={doc}
            selectedPages={selectedPages}
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAll={onSelectAll}
            onTogglePage={onTogglePage}
            isMmBased={isMmBased}
            dpi={dpi}
            onDpiChange={onDpiChange}
          />
        )}

        {/* JPG quality */}
        {format === 'jpg' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Quality</Label>
              <span className="text-xs text-muted-foreground">
                <span className="tabular-nums">{jpgQuality}%</span>
                <span className="ml-1.5 text-muted-foreground/60">
                  {getQualityLabel(jpgQuality)}
                </span>
              </span>
            </div>
            <Slider
              min={80}
              max={100}
              step={1}
              value={[jpgQuality]}
              onValueChange={([v]) => onJpgQualityChange(v)}
            />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button className="h-10 w-full" onClick={onExport} disabled={!canExport}>
          {exportButtonLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

function ImageOptions({
  doc,
  selectedPages,
  allSelected,
  someSelected,
  onSelectAll,
  onTogglePage,
  isMmBased,
  dpi,
  onDpiChange,
}: {
  doc: DocumentInfo;
  selectedPages: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (checked: boolean | 'indeterminate') => void;
  onTogglePage: (pageId: string, checked: boolean | 'indeterminate') => void;
  isMmBased: boolean;
  dpi: number;
  onDpiChange: (dpi: number) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {/* Page selection */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Pages</Label>
          <span className="text-xs text-muted-foreground">
            {selectedPages.size} of {doc.pages.length} selected
          </span>
        </div>
        <div className="flex max-h-44 flex-col overflow-y-auto rounded-lg border">
          <label
            htmlFor="select-all"
            className="flex cursor-pointer items-center gap-2.5 border-b px-3 py-2 hover:bg-muted/50"
          >
            <Checkbox
              id="select-all"
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={onSelectAll}
            />
            <span className="text-sm font-medium">All pages</span>
          </label>
          {doc.pages.map((page, index) => (
            <label
              key={page.id}
              htmlFor={`page-${page.id}`}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/50"
            >
              <Checkbox
                id={`page-${page.id}`}
                checked={selectedPages.has(page.id)}
                onCheckedChange={(checked) => onTogglePage(page.id, checked)}
              />
              <span className="flex items-baseline gap-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
                <span className="truncate">{page.name}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* DPI selector as pill buttons */}
      {isMmBased && (
        <div className="flex flex-col gap-2">
          <Label className="text-sm">Resolution</Label>
          <div className="grid grid-cols-3 gap-2">
            {DPI_OPTIONS.map((opt) => {
              const isSelected = dpi === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onDpiChange(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-foreground/20 hover:bg-muted/50',
                  )}
                >
                  <span className={cn('font-medium tabular-nums', isSelected && 'text-primary')}>
                    {opt.label} DPI
                  </span>
                  <span className="text-[11px] text-muted-foreground">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
