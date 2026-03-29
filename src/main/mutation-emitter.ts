import { EventEmitter } from 'node:events';
import type { WorkspaceMutationEvent } from '../shared/types';

declare interface MutationEmitter {
  emit(event: 'mutation', data: WorkspaceMutationEvent): boolean;
  on(event: 'mutation', listener: (data: WorkspaceMutationEvent) => void): this;
}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: typed EventEmitter pattern
class MutationEmitter extends EventEmitter {}

export const mutationEmitter = new MutationEmitter();
