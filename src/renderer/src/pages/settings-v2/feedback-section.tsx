import { Bug, Lightbulb, MessageSquareText } from 'lucide-react';
import type { FeedbackCategory } from '../../../../shared/types';

const CATEGORY_CARDS: Array<{
  category: FeedbackCategory;
  label: string;
  description: string;
  icon: typeof Bug;
}> = [
  {
    category: 'bug-report',
    label: 'Bug report',
    description: 'Share what broke and where you saw it.',
    icon: Bug,
  },
  {
    category: 'feature-idea',
    label: 'Feature idea',
    description: 'Suggest workflows or capabilities you want next.',
    icon: Lightbulb,
  },
  {
    category: 'general-feedback',
    label: 'General feedback',
    description: 'Tell us what is working well or needs polish.',
    icon: MessageSquareText,
  },
];

interface FeedbackSectionProps {
  onOpenFeedback: (category?: FeedbackCategory) => void;
}

export function FeedbackSection({ onOpenFeedback }: FeedbackSectionProps): React.JSX.Element {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Feedback</h2>
        <p className="text-sm text-muted-foreground">
          Send notes directly from Litho so the team can review them.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {CATEGORY_CARDS.map(({ category, label, description, icon: Icon }) => (
          <button
            key={category}
            type="button"
            onClick={() => onOpenFeedback(category)}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium">{label}</span>
              <span className="text-sm text-muted-foreground">{description}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
