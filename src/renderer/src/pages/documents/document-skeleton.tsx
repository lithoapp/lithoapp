import { Skeleton } from '@/components/ui/skeleton';

/** Fixed thumbnail container height in px — matches DocumentCard. */
const THUMB_HEIGHT = 180;

export function DocumentSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <Skeleton className="rounded-none border-b" style={{ height: THUMB_HEIGHT }} />
      <div className="flex flex-col gap-2 px-4 py-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
