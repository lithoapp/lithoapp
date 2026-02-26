import { Copy, Download, FlaskConical, Loader2, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useDocumentConfig } from '@/hooks/use-document-config';
import { usePageBuild } from '@/hooks/use-page-build';
import { usePageExport } from '@/hooks/use-page-export';
import type { RenderApproach, RendererError } from '../../../../shared/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ApproachOption = 'auto' | RenderApproach;
type ExportFormat = 'pdf' | 'png' | 'jpg';

function showError(err: RendererError): void {
  toast.error('Operation failed', { description: err.message });
}

function RendererPocPage(): React.JSX.Element {
  const [approachOption, setApproachOption] = useState<ApproachOption>('auto');
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState<string | undefined>();
  const [documents, setDocuments] = useState<string[]>([]);
  const [document, setDocument] = useState<string | undefined>();
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState<string | undefined>();

  // Export state
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [dpi, setDpi] = useState(150);
  const [jpgQuality, setJpgQuality] = useState(90);

  const { data: buildData, loading: isBuilding, error: buildError, build, reset } = usePageBuild();
  const { loading: isExporting, error: exportError, exportPage } = usePageExport();
  const { config } = useDocumentConfig(workspace, document);

  // Show errors via toast
  useEffect(() => {
    if (buildError) showError(buildError);
  }, [buildError]);

  useEffect(() => {
    if (exportError) showError(exportError);
  }, [exportError]);

  // Load workspaces on mount
  useEffect(() => {
    void (async () => {
      const result = await window.litho.renderer.listWorkspaces();
      if (result.ok) {
        setWorkspaces(result.data);
      } else {
        showError(result.error);
      }
    })();
  }, []);

  // Load documents when workspace changes
  useEffect(() => {
    setDocument(undefined);
    setDocuments([]);
    setPage(undefined);
    setPages([]);
    reset();
    if (!workspace) return;

    void (async () => {
      const result = await window.litho.renderer.listDocuments(workspace);
      if (result.ok) {
        setDocuments(result.data);
      } else {
        showError(result.error);
      }
    })();
  }, [workspace, reset]);

  // Load pages when document changes
  useEffect(() => {
    setPage(undefined);
    setPages([]);
    reset();
    if (!workspace || !document) return;

    void (async () => {
      const result = await window.litho.renderer.listPages(workspace, document);
      if (result.ok) {
        setPages(result.data);
      } else {
        showError(result.error);
      }
    })();
  }, [workspace, document, reset]);

  const handleBuild = async (): Promise<void> => {
    if (!workspace || !document || !page) return;
    const approach = approachOption === 'auto' ? undefined : approachOption;
    await build(workspace, document, page, approach);
  };

  const handleExport = async (): Promise<void> => {
    if (!buildData || !config) return;

    const ext = exportFormat === 'pdf' ? 'pdf' : exportFormat;
    const fileName = `${document ?? 'page'}-${page ?? 'export'}`;
    const savePath = await window.litho.export.saveDialog({
      format: ext,
      title: fileName,
      isZip: false,
    });
    if (!savePath) return;

    const success = await exportPage({
      html: buildData.html,
      approach: buildData.approach,
      format: exportFormat,
      size: config.size,
      dpi,
      jpgQuality,
      savePath,
    });
    if (success) {
      toast.success(`Exported ${exportFormat.toUpperCase()}`, { description: savePath });
    }
  };

  const isReady = workspace && document && page;
  const docSize = config?.size ?? null;
  const isMmBased = docSize?.unit === 'mm';
  const isJpg = exportFormat === 'jpg';

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-forge" />
        <h1 className="font-display text-xl font-bold">Renderer POC</h1>
        <span className="text-sm text-muted-foreground">TSX + Tailwind → HTML</span>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Approach</Label>
          <Select
            value={approachOption}
            onValueChange={(v) => setApproachOption(v as ApproachOption)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="csr">CSR</SelectItem>
              <SelectItem value="ssr">SSR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Workspace</Label>
          <Select value={workspace ?? ''} onValueChange={setWorkspace}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Document</Label>
          <Select
            value={document ?? ''}
            onValueChange={setDocument}
            disabled={documents.length === 0}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select document" />
            </SelectTrigger>
            <SelectContent>
              {documents.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Page</Label>
          <Select value={page ?? ''} onValueChange={setPage} disabled={pages.length === 0}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select page" />
            </SelectTrigger>
            <SelectContent>
              {pages.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleBuild} disabled={isBuilding || !isReady}>
          {isBuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Build'}
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={!isReady}
          onClick={() => {
            const params = JSON.stringify(
              { approach: approachOption, workspace, document, page },
              null,
              2,
            );
            void navigator.clipboard.writeText(params).then(() => {
              toast.success('Parameters copied');
            });
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      {buildData && docSize && (
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Format</Label>
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpg">JPG</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isMmBased && exportFormat !== 'pdf' && (
            <div className="flex flex-col gap-1.5">
              <Label>DPI</Label>
              <Select value={String(dpi)} onValueChange={(v) => setDpi(Number(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="72">72</SelectItem>
                  <SelectItem value="150">150</SelectItem>
                  <SelectItem value="300">300</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isJpg && (
            <div className="flex flex-col gap-1.5">
              <Label>Quality: {jpgQuality}%</Label>
              <Slider
                className="w-32"
                min={80}
                max={100}
                step={1}
                value={[jpgQuality]}
                onValueChange={([v]) => setJpgQuality(v)}
              />
            </div>
          )}

          {docSize && (
            <span className="text-xs text-muted-foreground">
              {docSize.width}x{docSize.height} {docSize.unit}
            </span>
          )}

          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </div>
      )}

      {buildData?.timings && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{buildData.timings.total}ms</span>
            total
          </div>
          <span className="text-border">|</span>
          <span>
            {buildData.approach.toUpperCase()}
            {approachOption === 'auto' && ' (auto)'}
          </span>
          <span className="text-border">|</span>
          <span>esbuild {buildData.timings.esbuild}ms</span>
          <span>tailwind {buildData.timings.tailwind}ms</span>
          {buildData.timings.ssrRender !== null && (
            <span>ssr render {buildData.timings.ssrRender}ms</span>
          )}
          <span>assets {buildData.timings.assetInlining}ms</span>
          <span className="text-border">|</span>
          <span>{formatBytes(buildData.htmlBytes)}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 rounded-lg border border-border bg-white">
        {buildData ? (
          <iframe
            srcDoc={buildData.html}
            title="Rendered page"
            className="h-full w-full rounded-lg"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {isBuilding ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building...
              </div>
            ) : (
              'Select a workspace, document, and page, then click Build'
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { RendererPocPage };
