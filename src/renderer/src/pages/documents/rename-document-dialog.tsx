import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface RenameDocumentDialogProps {
  open: boolean;
  currentTitle: string;
  onRename: (newTitle: string) => void;
  onClose: () => void;
}

export function RenameDocumentDialog({
  open,
  currentTitle,
  onRename,
  onClose,
}: RenameDocumentDialogProps): React.JSX.Element {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(currentTitle);
  }, [open, currentTitle]);

  const isValid = value.trim() !== '' && value.trim() !== currentTitle;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Document title"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isValid) onRename(value.trim());
          }}
          className="h-11 px-4 text-base"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-11">
            Cancel
          </Button>
          <Button disabled={!isValid} onClick={() => onRename(value.trim())} className="h-11">
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
