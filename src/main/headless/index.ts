/**
 * Headless entrypoint for litho-lab eval harness.
 *
 * Spoken to over stdio with newline-delimited JSON-RPC 2.0. See
 * docs/headless-protocol.md for the full protocol surface.
 *
 * Invoked from src/main/index.ts when `--headless` is passed on the command
 * line. Runs inside app.whenReady() but never creates a BrowserWindow.
 */

import { app } from 'electron';
import { waitForModelsReady } from '../ai-providers/providers/models-cache';
import { closeAllDbs } from '../workspace-data';
import { TEMPLATE_IDS } from '../workspace-data/design-system-pages';
import { createDispatcher, type Dispatcher } from './json-rpc';
import { interceptConsole, type LogLevel, log, setLogLevel } from './logger';
import { createAgentService } from './services/agent-service';
import { handleConversationSave } from './services/conversation-service';
import {
  handleDocumentCreate,
  handleDocumentList,
  handleDocumentUpdateSize,
} from './services/document-service';
import { handleDocumentExport } from './services/export-service';
import {
  handleProviderList,
  handleProviderListModels,
  handleProviderSetCredential,
} from './services/provider-service';
import {
  handleWorkspaceClose,
  handleWorkspaceCreate,
  handleWorkspaceDelete,
  handleWorkspaceList,
  handleWorkspaceOpen,
} from './services/workspace-service';

const PROTOCOL_VERSION = '0.1.0';

let dispatcher: Dispatcher | null = null;
let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'shutting down');
  try {
    closeAllDbs();
  } catch (err) {
    log('error', 'error closing workspace dbs', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  dispatcher?.stop();
  app.quit();
}

export async function startHeadless(options: { logLevel?: LogLevel } = {}): Promise<void> {
  interceptConsole();
  if (options.logLevel) setLogLevel(options.logLevel);

  log('info', 'headless mode starting', { version: PROTOCOL_VERSION });

  // AI subsystem (credential tables, models cache) is initialized as a side
  // effect of registerAiProviderHandlers() in src/main/index.ts's top-level
  // block. Here we just wait until the models cache is populated before
  // accepting RPC calls.
  await waitForModelsReady();
  log('info', 'ai subsystem ready');

  dispatcher = createDispatcher({ onShutdown: shutdown });

  // --- Lifecycle ---
  dispatcher.register('initialize', async () => {
    await waitForModelsReady();
    return {
      version: PROTOCOL_VERSION,
      agents: ['design-system', 'document', 'workspace'],
      supportedFormats: ['pdf', 'png', 'jpg'],
      templates: TEMPLATE_IDS,
    };
  });
  dispatcher.register('shutdown', () => {
    // Schedule shutdown after this response is flushed to stdout.
    queueMicrotask(() => shutdown());
    return {};
  });

  // --- Workspace ---
  dispatcher.register('workspace.create', (params) =>
    handleWorkspaceCreate(params as Parameters<typeof handleWorkspaceCreate>[0]),
  );
  dispatcher.register('workspace.open', (params) =>
    handleWorkspaceOpen(params as Parameters<typeof handleWorkspaceOpen>[0]),
  );
  dispatcher.register('workspace.list', () => handleWorkspaceList());
  dispatcher.register('workspace.close', (params) =>
    handleWorkspaceClose(params as Parameters<typeof handleWorkspaceClose>[0]),
  );
  dispatcher.register('workspace.delete', (params) =>
    handleWorkspaceDelete(params as Parameters<typeof handleWorkspaceDelete>[0]),
  );

  // --- Documents ---
  dispatcher.register('document.create', (params) =>
    handleDocumentCreate(params as Parameters<typeof handleDocumentCreate>[0]),
  );
  dispatcher.register('document.updateSize', (params) =>
    handleDocumentUpdateSize(params as Parameters<typeof handleDocumentUpdateSize>[0]),
  );
  dispatcher.register('document.list', (params) =>
    handleDocumentList(params as Parameters<typeof handleDocumentList>[0]),
  );
  dispatcher.register('document.export', (params) =>
    handleDocumentExport(params as Parameters<typeof handleDocumentExport>[0]),
  );

  // --- Conversations ---
  dispatcher.register('conversation.save', (params) =>
    handleConversationSave(params as Parameters<typeof handleConversationSave>[0]),
  );

  // --- Providers ---
  dispatcher.register('provider.setCredential', (params) =>
    handleProviderSetCredential(params as Parameters<typeof handleProviderSetCredential>[0]),
  );
  dispatcher.register('provider.list', () => handleProviderList());
  dispatcher.register('provider.listModels', (params) =>
    handleProviderListModels(params as Parameters<typeof handleProviderListModels>[0]),
  );

  // --- Agent runs ---
  const agentService = createAgentService(dispatcher);
  dispatcher.register('agent.run', (params) =>
    agentService.run(params as Parameters<typeof agentService.run>[0]),
  );
  dispatcher.register('agent.abort', (params) =>
    agentService.abort(params as Parameters<typeof agentService.abort>[0]),
  );

  // Signal handlers for graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  dispatcher.start();
  log('info', 'headless dispatcher ready, listening on stdin');
}
