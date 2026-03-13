import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CHAT_PREFS_KEY } from '@/lib/chat-prefs';

export function AdvancedSection(): React.JSX.Element {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  async function handleResetConfirm(): Promise<void> {
    setResetDialogOpen(false);
    localStorage.removeItem(CHAT_PREFS_KEY);
    await window.litho.preferences.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Advanced</h2>
        <p className="text-sm text-muted-foreground">Advanced settings and actions.</p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/50 p-5">
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-medium text-destructive">Reset Preferences</Label>
          <p className="text-sm text-muted-foreground">
            Clear profile, AI connections, and settings. Workspaces are preserved.
          </p>
        </div>
        <Button variant="destructive" onClick={() => setResetDialogOpen(true)}>
          Reset
        </Button>
      </div>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset all preferences?</DialogTitle>
            <DialogDescription className="space-y-2">
              This will clear your profile, AI provider connections, and app settings. The app will
              restart and show the onboarding screen.
              <br />
              <br />
              <strong>Your workspaces and documents will be preserved.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetConfirm}>
              Reset & Restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
