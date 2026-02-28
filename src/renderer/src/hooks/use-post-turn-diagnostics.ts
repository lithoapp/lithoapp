import { useCallback, useEffect, useRef } from 'react';

export interface PostTurnValidator {
  /** Tool names that trigger this validator */
  tools: string[];
  /** Extract a dirty key from tool args (e.g. 'css' or a pageId) */
  getDirtyKey(tool: string, args: Record<string, unknown>): string;
  /** Validate dirty keys, return error strings (empty = clean) */
  validate(dirtyKeys: Set<string>): Promise<string[]>;
  /** Format errors into a message for the agent */
  formatMessage(errors: string[]): string;
}

const DIAGNOSTIC_PREFIX = '[diagnostic] ';

export function addDiagnosticPrefix(message: string): string {
  return DIAGNOSTIC_PREFIX + message;
}

export function isDiagnosticMessage(text: string): boolean {
  return text.startsWith(DIAGNOSTIC_PREFIX);
}

export function stripDiagnosticPrefix(text: string): string {
  return text.slice(DIAGNOSTIC_PREFIX.length);
}

/**
 * Post-turn diagnostics hook.
 *
 * Accumulates dirty keys when tools complete, then validates on busy→idle
 * transition. If errors are found, injects a diagnostic message via sendMessage.
 *
 * Returns an `onToolComplete` callback to wire into the chat.
 */
export function usePostTurnDiagnostics(
  validators: PostTurnValidator[],
  sendMessageRef: React.RefObject<((text: string) => void) | null>,
  isBusy: boolean,
): (tool: string, args: Record<string, unknown>) => void {
  const dirtyRef = useRef(new Map<PostTurnValidator, Set<string>>());
  const prevBusyRef = useRef(isBusy);
  const validatorsRef = useRef(validators);
  validatorsRef.current = validators;

  const onToolComplete = useCallback((tool: string, args: Record<string, unknown>) => {
    for (const validator of validatorsRef.current) {
      if (!validator.tools.includes(tool)) continue;
      const key = validator.getDirtyKey(tool, args);
      const existing = dirtyRef.current.get(validator);
      if (existing) {
        existing.add(key);
      } else {
        dirtyRef.current.set(validator, new Set([key]));
      }
    }
  }, []);

  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = isBusy;

    if (!wasBusy || isBusy) return;
    if (!sendMessageRef.current) return;

    const entries = [...dirtyRef.current.entries()];
    dirtyRef.current = new Map();

    if (entries.length === 0) return;

    const send = sendMessageRef.current;
    void (async () => {
      for (const [validator, dirtyKeys] of entries) {
        try {
          const errors = await validator.validate(dirtyKeys);
          if (errors.length === 0) continue;
          send(addDiagnosticPrefix(validator.formatMessage(errors)));
        } catch {
          // validation failure is non-fatal
        }
      }
    })();
  }, [isBusy, sendMessageRef]);

  return onToolComplete;
}
