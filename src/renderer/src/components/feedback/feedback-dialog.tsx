import * as Sentry from '@sentry/electron/renderer';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { FeedbackCategory } from '../../../../shared/types';

const CATEGORY_OPTIONS: Array<{
  value: FeedbackCategory;
  label: string;
}> = [
  {
    value: 'bug-report',
    label: 'Bug report',
  },
  {
    value: 'feature-idea',
    label: 'Feature idea',
  },
  {
    value: 'general-feedback',
    label: 'General feedback',
  },
];

function isFeedbackCategory(value: string): value is FeedbackCategory {
  return CATEGORY_OPTIONS.some((option) => option.value === value);
}

function buildTechnicalDetailsContext({
  appArea,
  appVersion,
  documentId,
  documentTitle,
  platform,
  workspaceName,
  workspaceTitle,
}: {
  appArea: string;
  appVersion: string;
  documentId?: string | null;
  documentTitle?: string | null;
  platform: string;
  workspaceName?: string | null;
  workspaceTitle?: string | null;
}) {
  return {
    appVersion: appVersion || 'Unavailable',
    platform: platform || 'Unavailable',
    appArea,
    workspaceName: workspaceName ?? undefined,
    workspaceTitle: workspaceTitle ?? undefined,
    documentId: documentId ?? undefined,
    documentTitle: documentTitle ?? undefined,
    associatedEventId: Sentry.lastEventId() ?? undefined,
  };
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategory?: FeedbackCategory;
  defaultEmail?: string | null;
  appArea: string;
  workspaceName?: string | null;
  workspaceTitle?: string | null;
  documentId?: string | null;
  documentTitle?: string | null;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  initialCategory = 'general-feedback',
  defaultEmail,
  appArea,
  workspaceName,
  workspaceTitle,
  documentId,
  documentTitle,
}: FeedbackDialogProps): React.JSX.Element {
  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [includeTechnicalDetails, setIncludeTechnicalDetails] = useState(true);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [platform, setPlatform] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('');
  const [didAttemptSubmit, setDidAttemptSubmit] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCategory(initialCategory);
    setMessage('');
    setEmail(defaultEmail ?? '');
    setDidAttemptSubmit(false);
    void Promise.all([window.litho.app.getPlatform(), window.litho.app.getVersion()])
      .then(([nextPlatform, nextVersion]) => {
        setPlatform(nextPlatform);
        setAppVersion(nextVersion);
      })
      .catch(() => {
        setPlatform('');
        setAppVersion('');
      });
  }, [defaultEmail, initialCategory, open]);

  const messageError = message.trim() ? null : 'Please add a message.';

  async function handleSubmit(): Promise<void> {
    setDidAttemptSubmit(true);
    if (messageError) {
      return;
    }

    setIsSubmitting(true);
    let progressToastId: string | number | undefined;

    try {
      let screenshot: Uint8Array | null = null;

      if (includeScreenshot) {
        onOpenChange(false);
        progressToastId = toast.loading('Capturing screenshot...');
        await waitForNextPaint();
        screenshot = await window.litho.feedback.captureScreenshot();
      }

      const technicalDetails = buildTechnicalDetailsContext({
        appArea,
        appVersion,
        documentId,
        documentTitle,
        platform,
        workspaceName,
        workspaceTitle,
      });
      const scope = new Sentry.Scope();

      scope.setTag('feedback_category', category);
      scope.setTag('app_area', appArea);
      if (includeTechnicalDetails) {
        scope.setContext('technical_details', technicalDetails);
      }

      await Sentry.sendFeedback(
        {
          email: email.trim() || undefined,
          message: message.trim(),
          source: 'in-app-feedback',
          associatedEventId: includeTechnicalDetails
            ? technicalDetails.associatedEventId
            : undefined,
          tags: {
            feedback_category: category,
          },
        },
        {
          attachments: screenshot
            ? [{ filename: 'litho-feedback-screenshot.png', data: screenshot }]
            : undefined,
          captureContext: scope,
        },
      );

      if (progressToastId !== undefined) {
        toast.dismiss(progressToastId);
      }

      console.info('[feedback] Sent feedback successfully');
      toast.success('Thanks for the feedback. It was sent to the Litho team.');
      setMessage('');
      setIncludeScreenshot(false);
      setIncludeTechnicalDetails(true);
      setDidAttemptSubmit(false);
      onOpenChange(false);
    } catch (error) {
      if (progressToastId !== undefined) {
        toast.dismiss(progressToastId);
        onOpenChange(true);
      }
      console.error('[feedback] Failed to send feedback', error);
      const description = error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to send feedback', { description });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>Only what you choose to send.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="feedback-category">Category</Label>
            <Select
              value={category}
              onValueChange={(value) => {
                if (isFeedbackCategory(value)) {
                  setCategory(value);
                }
              }}
            >
              <SelectTrigger id="feedback-category" className="h-11 w-full justify-between bg-card">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="feedback-message">
              Message <span className="text-muted-foreground">(required)</span>
            </Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What happened, what were you trying to do, or what would you like to see?"
              className="min-h-24 resize-y bg-card"
              aria-invalid={didAttemptSubmit && !!messageError}
            />
            {didAttemptSubmit && messageError && (
              <p className="text-sm text-destructive">{messageError}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="feedback-email">Email</Label>
            <Input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="h-11 bg-card"
            />
            <p className="text-sm text-muted-foreground">
              Optional, in case we need to follow up about your note.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border bg-card/60 p-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="feedback-technical-details" className="text-sm font-medium leading-5">
                Include technical details
              </Label>
              <p className="text-sm text-muted-foreground">
                Includes safe app diagnostics only, never document contents or API keys.
              </p>
            </div>
            <Checkbox
              id="feedback-technical-details"
              checked={includeTechnicalDetails}
              onCheckedChange={(checked) => setIncludeTechnicalDetails(checked === true)}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border bg-card/60 p-4">
            <div className="flex items-start gap-3">
              <MonitorSmartphone className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <Label htmlFor="feedback-screenshot" className="text-sm font-medium leading-5">
                  Attach a screenshot
                </Label>
                <p className="text-sm text-muted-foreground">
                  If enabled, Litho captures the current app window only.
                </p>
              </div>
            </div>
            <Checkbox
              id="feedback-screenshot"
              checked={includeScreenshot}
              onCheckedChange={(checked) => setIncludeScreenshot(checked === true)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
