/**
 * Workspace data access layer.
 *
 * All reads go through this module so the storage backend can be swapped.
 * Backend: SQLite via `db-backend.ts`.
 */

export { closeAllDbs, closeWorkspaceDb, generateId, getWorkspaceDb } from './db';
export {
  createDocument,
  createNewWorkspace,
  deleteDocument,
  duplicateDocument,
  getDesignSystemDocId,
  getDesignSystemDocInfo,
  getDocumentCount,
  listDocuments,
  listDocumentsFull,
  listPages,
  listWorkspaces,
  readAssetFile,
  readDesignSystem,
  readDocumentConfig,
  readPageDescription,
  readPageSource,
  readStyles,
  readWorkspaceConfig,
  renameDocument,
  updateDesignTokens,
  updateDocumentFolder,
  updatePageDetails,
  writePageSource,
} from './db-backend';
