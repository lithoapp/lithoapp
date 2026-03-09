import { ArrowRight } from 'lucide-react';

interface ParsedGroup {
  page: string;
  changes: ParsedChange[];
}

interface ParsedChange {
  text: string;
  isTextChange: boolean;
  oldText?: string;
  newText?: string;
}

function parseVisualEditPrompt(text: string): ParsedGroup[] {
  const lines = text.split('\n').filter((l) => l.trim());
  const groups: ParsedGroup[] = [];
  let current: ParsedGroup | null = null;

  for (const line of lines) {
    if (line.startsWith('## Page ')) {
      const match = line.match(/## Page "(.+?)"/);
      current = { page: match?.[1] ?? 'Unknown', changes: [] };
      groups.push(current);
    } else if (/^\d+\.\s/.test(line) && current) {
      const content = line.replace(/^\d+\.\s*/, '');
      const textMatch = content.match(/^Change text "(.+?)" to "(.+?)"/);
      if (textMatch) {
        current.changes.push({
          text: content,
          isTextChange: true,
          oldText: textMatch[1],
          newText: textMatch[2],
        });
      } else {
        current.changes.push({ text: content, isTextChange: false });
      }
    }
  }

  return groups;
}

export const VISUAL_EDIT_PREFIX = 'Make the following visual edits:';

export function isVisualEditMessage(content: string): boolean {
  return content.startsWith(VISUAL_EDIT_PREFIX);
}

export function VisualEditContent({ text }: { text: string }) {
  const groups = parseVisualEditPrompt(text);

  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground">{text}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <div key={group.page} className="flex flex-col gap-1">
          {group.page && <p className="text-xs font-medium text-muted-foreground">{group.page}</p>}
          {group.changes.map((change) => (
            <div key={change.text} className="rounded bg-primary/5 px-2.5 py-1.5 text-xs">
              {change.isTextChange ? (
                <span>
                  <span className="line-through text-muted-foreground">{change.oldText}</span>{' '}
                  <ArrowRight className="inline h-3 w-3 text-muted-foreground" />{' '}
                  <span className="font-medium">{change.newText}</span>
                </span>
              ) : (
                <span>{change.text}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
