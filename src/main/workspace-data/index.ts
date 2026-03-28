/**
 * Workspace data access layer.
 *
 * All reads go through this module so the storage backend can be swapped.
 * Backend: SQLite via `db-backend.ts`.
 */

export { closeAllDbs, closeWorkspaceDb, generateId, getWorkspaceDb } from './db';
export {
  clearConversation,
  createDocument,
  createNewWorkspace,
  createSnapshot,
  deleteDocument,
  duplicateDocument,
  getDesignSystemDocId,
  getDesignSystemDocInfo,
  getDocumentCount,
  listDocuments,
  listDocumentsFull,
  listPages,
  listSnapshotMessageIds,
  listWorkspaces,
  loadConversation,
  readAssetFile,
  readDesignSystem,
  readDocumentConfig,
  readPageDescription,
  readPageSource,
  readStyles,
  renameDocument,
  revertToSnapshot,
  saveConversation,
  updateDocumentFolder,
  updatePageDetails,
  updateWorkspaceLastOpened,
  writePageSource,
} from './db-backend';
export { exportWorkspaceSource } from './export-source';
