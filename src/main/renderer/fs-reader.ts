/**
 * Re-exports workspace data access for the renderer module.
 * Delegates to the centralized workspace-data layer.
 */
export {
  listDocuments,
  listPages,
  listWorkspaces,
  readDocumentConfig,
  readPageSource,
  readStyles,
} from '../workspace-data';
