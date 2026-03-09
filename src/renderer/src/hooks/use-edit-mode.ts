import { useCallback, useEffect, useState } from 'react';
import { compileEditPrompt } from '@/components/edit-mode/compile-prompt';
import type { ChangeRequest, PendingChange, TextChange } from '@/components/edit-mode/types';
import type { PageInfo } from '../../../shared/types';

interface UseEditModeOptions {
  workspaceName: string;
  docId: string;
  pages: PageInfo[];
  setPageHtmlMap: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  sendMessageRef: React.RefObject<((text: string) => void) | null>;
}

interface UseEditModeReturn {
  editMode: boolean;
  pendingChanges: PendingChange[];
  toggleEditMode: () => void;
  removePendingChange: (id: string) => void;
  confirmEdits: () => void;
  discardEdits: () => void;
}

export function useEditMode({
  workspaceName,
  docId,
  pages,
  setPageHtmlMap,
  sendMessageRef,
}: UseEditModeOptions): UseEditModeReturn {
  const [editMode, setEditMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  // Rebuild all pages for edit mode (with loc injection + editor script)
  const buildPagesForEditMode = useCallback(
    async (isEditMode: boolean) => {
      for (const page of pages) {
        try {
          const result = await window.litho.renderer.build(
            workspaceName,
            docId,
            page.id,
            undefined,
            isEditMode,
          );
          if (result.ok) {
            setPageHtmlMap((prev) => new Map(prev).set(page.id, result.data.html));
          }
        } catch (err) {
          console.error(`[document] Edit mode build failed for ${page.id}:`, err);
        }
      }
    },
    [workspaceName, docId, pages, setPageHtmlMap],
  );

  // When edit mode toggles, rebuild pages with/without editor injection
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild on editMode toggle
  useEffect(() => {
    void buildPagesForEditMode(editMode);
  }, [editMode]);

  // Listen for postMessage events from editor script in iframes
  useEffect(() => {
    if (!editMode) return;

    function handleMessage(e: MessageEvent) {
      const data = e.data;
      if (data?.source !== 'litho-editor') return;

      const pageId = data.pageId as string;
      const pageName = pages.find((p) => p.id === pageId)?.name ?? 'Untitled';
      const id = crypto.randomUUID();

      if (data.type === 'text-change') {
        const loc = data.loc as string;
        const newText = data.newText as string;
        setPendingChanges((prev) => {
          const existingIdx = prev.findIndex((c) => c.type === 'text' && c.loc === loc);
          if (existingIdx !== -1) {
            const existing = prev[existingIdx] as TextChange;
            if (existing.oldText === newText) {
              return prev.filter((_, i) => i !== existingIdx);
            }
            const updated = { ...existing, newText };
            return prev.map((c, i) => (i === existingIdx ? updated : c));
          }
          return [
            ...prev,
            {
              type: 'text' as const,
              id,
              pageId,
              pageName,
              loc,
              oldText: data.oldText as string,
              newText,
            },
          ];
        });
      } else if (data.type === 'change-request') {
        setPendingChanges((prev) => [
          ...prev,
          {
            type: 'request',
            id,
            pageId,
            pageName,
            loc: data.loc as string,
            elementInfo: data.elementInfo as ChangeRequest['elementInfo'],
            description: data.description as string,
          },
        ]);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [editMode, pages]);

  const toggleEditMode = useCallback(() => {
    setEditMode((m) => !m);
  }, []);

  const removePendingChange = useCallback((id: string) => {
    setPendingChanges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const confirmEdits = useCallback(() => {
    if (pendingChanges.length === 0) return;
    const prompt = compileEditPrompt(pendingChanges);
    setPendingChanges([]);
    setEditMode(false);
    // Small delay to let chat panel mount before sending
    setTimeout(() => {
      sendMessageRef.current?.(prompt);
    }, 100);
  }, [pendingChanges, sendMessageRef]);

  const discardEdits = useCallback(() => {
    setPendingChanges([]);
    setEditMode(false);
  }, []);

  return {
    editMode,
    pendingChanges,
    toggleEditMode,
    removePendingChange,
    confirmEdits,
    discardEdits,
  };
}
