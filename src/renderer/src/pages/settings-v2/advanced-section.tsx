import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function AdvancedSection(): React.JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    window.litho.advancedTools
      .getEnabled()
      .then(setEnabled)
      .catch(() => toast.error('Failed to load settings'));
  }, []);

  async function handleToggle(value: boolean): Promise<void> {
    await window.litho.advancedTools.setEnabled(value);
    setEnabled(value);
  }

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      const result = await window.litho.advancedTools.exportSource();
      if (result.success) {
        toast.success(`Exported to ${result.path}`);
      } else if (result.error !== 'Cancelled') {
        toast.error(result.error ?? 'Export failed');
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Advanced</h2>
        <p className="text-sm text-muted-foreground">Developer and debugging tools.</p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="advanced-toggle" className="text-sm font-medium">
            Advanced tools
          </Label>
          <p className="text-sm text-muted-foreground">
            Enable debug features for troubleshooting.
          </p>
        </div>
        <Switch id="advanced-toggle" checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-5">
          <div className="flex flex-col gap-1">
            <Label className="text-sm font-medium">Export workspace source</Label>
            <p className="text-sm text-muted-foreground">
              Download all pages as TSX files with metadata for debugging.
            </p>
          </div>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      )}
    </div>
  );
}
