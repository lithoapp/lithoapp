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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DocumentInfo, ExportFormat, ExportProgress } from '../../../../shared/types';

interface ExportDialogProps {
  doc: DocumentInfo;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DPI_OPTIONS = [72, 150, 300] as const;

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

  const isImage = format !== 'pdf';
  const isMmBased = doc.size.unit === 'mm';
  const isExporting = exportStatus === 'exporting';

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFormat('pdf');
      setSelectedPages(new Set(doc.pages.map((p) => p.id)));
      setDpi(150);
      setJpgQuality(90);
      setExportStatus('idle');
      setProgress({ status: 'idle', current: 0, total: 0 });
    }
  }, [open, doc.pages]);

  // Subscribe to progress events
  useEffect(() => {
    if (!open) return;
    const unsubscribe = window.litho.export.onProgress((data: ExportProgress) => {
      setProgress(data);
      setExportStatus(data.status);

      if (data.status === 'done') {
        toast.success('Document exported successfully');
        onOpenChange(false);
      } else if (data.status === 'error') {
        toast.error(data.error ?? 'Export failed');
        onOpenChange(false);
      }
    });
    return unsubscribe;
  }, [open, onOpenChange]);

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
      title: doc.title,
      isZip,
    });
    if (!savePath) return;

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isExporting}>
        {isExporting ? (
          <ExportingView
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
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExportingView({
  current,
  total,
  percent,
}: {
  current: number;
  total: number;
  percent: number;
}): React.JSX.Element {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Exporting...</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-2">
        <p className="text-sm text-muted-foreground">
          Rendering page {Math.min(current + 1, total)} of {total}...
        </p>
        <Progress value={percent} />
      </div>
    </>
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
}): React.JSX.Element {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Export &ldquo;{doc.title}&rdquo;</DialogTitle>
        <DialogDescription>Export as PDF or images.</DialogDescription>
      </DialogHeader>

      <Tabs
        value={format}
        onValueChange={(v) => onFormatChange(v as ExportFormat)}
        className="gap-4"
      >
        <TabsList className="w-full">
          <TabsTrigger value="pdf" className="flex-1">
            PDF
          </TabsTrigger>
          <TabsTrigger value="png" className="flex-1">
            PNG
          </TabsTrigger>
          <TabsTrigger value="jpg" className="flex-1">
            JPG
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pdf">
          <p className="text-sm text-muted-foreground">
            All {doc.pages.length} page{doc.pages.length !== 1 ? 's' : ''} will be exported as a
            single PDF.
          </p>
        </TabsContent>

        <TabsContent value="png">
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
        </TabsContent>

        <TabsContent value="jpg">
          <div className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Quality</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{jpgQuality}%</span>
              </div>
              <Slider
                min={80}
                max={100}
                step={1}
                value={[jpgQuality]}
                onValueChange={([v]) => onJpgQualityChange(v)}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button className="h-11" onClick={onExport} disabled={!canExport}>
          Export
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
      <div className="flex flex-col gap-2">
        <Label className="text-sm">Pages</Label>
        <div className="flex max-h-36 flex-col gap-1.5 overflow-y-auto rounded-md border p-2">
          <div className="flex items-center gap-2 py-0.5">
            <Checkbox
              id="select-all"
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={onSelectAll}
            />
            <Label htmlFor="select-all" className="text-sm font-medium">
              Select all
            </Label>
          </div>
          {doc.pages.map((page, index) => (
            <div key={page.id} className="flex items-center gap-2 py-0.5 pl-4">
              <Checkbox
                id={`page-${page.id}`}
                checked={selectedPages.has(page.id)}
                onCheckedChange={(checked) => onTogglePage(page.id, checked)}
              />
              <Label htmlFor={`page-${page.id}`} className="text-sm">
                Page {index + 1}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {isMmBased && (
        <div className="flex flex-col gap-2">
          <Label className="text-sm">Resolution</Label>
          <RadioGroup
            value={String(dpi)}
            onValueChange={(v) => onDpiChange(Number(v))}
            className="flex gap-4"
          >
            {DPI_OPTIONS.map((opt) => (
              <div key={opt} className="flex items-center gap-1.5">
                <RadioGroupItem value={String(opt)} id={`dpi-${opt}`} />
                <Label htmlFor={`dpi-${opt}`} className="text-sm">
                  {opt} DPI
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      )}
    </div>
  );
}
