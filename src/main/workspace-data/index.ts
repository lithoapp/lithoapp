/**
 * Workspace data access layer.
 *
 * All reads go through this module so the storage backend can be swapped
 * (e.g. from filesystem to database) by replacing `fs-backend.ts`.
 */
export {
  getDocumentCount,
  listDocuments,
  listPages,
  listWorkspaces,
  readDocumentConfig,
  readPageSource,
  readStyles,
  readWorkspaceConfig,
} from './fs-backend';
