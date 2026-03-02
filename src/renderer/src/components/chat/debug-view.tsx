import type { StoredMessage } from '../../../../shared/types';

export function DebugView({ message }: { message: StoredMessage }): React.JSX.Element {
  return (
    <pre className="text-[11px] leading-tight text-muted-foreground whitespace-pre-wrap break-all">
      {JSON.stringify(message, null, 2)}
    </pre>
  );
}
