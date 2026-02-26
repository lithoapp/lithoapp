/**
 * Workspace data access layer.
 *
 * All reads go through this module so the storage backend can be swapped
 * (e.g. from filesystem to database) by replacing `fs-backend.ts`.
 */
export {
  createDocument,
  createNewWorkspace,
  deleteDocument,
  getDocumentCount,
  listDocuments,
  listDocumentsFull,
  listPages,
  listWorkspaces,
  readAssetFile,
  readDesignSystem,
  readDocumentConfig,
  readPageSource,
  readStyles,
  readWorkspaceConfig,
  updateDesignTokens,
  updateDocumentFolder,
} from './fs-backend';
