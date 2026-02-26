import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import type { WorkspaceServer } from '@kareemaly/litho-workspace-server';
import { createWorkspace, invalidateManifestCache, serve } from '@kareemaly/litho-workspace-server';
import type { WorkspaceError, WorkspaceServerInfo, WorkspaceServerStatus } from '../shared/types';
import { captureException, captureMessage } from './sentry';

export type { WorkspaceError, WorkspaceServerInfo, WorkspaceServerStatus };

const HEALTH_CHECK_INTERVAL_MS = 10_000;

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Failed to get port')));
      }
    });
    srv.on('error', reject);
  });
}

export class WorkspaceManager extends EventEmitter {
  private server: WorkspaceServer | null = null;
  private _status: WorkspaceServerStatus = 'stopped';
  private _workspacePath: string | null = null;
  private _workspaceName: string | null = null;
  private healthInterval?: ReturnType<typeof setInterval>;
  private starting = false;

  async startWorkspace(workspacePath: string, name: string): Promise<void> {
    if (this.server || this._status === 'running') {
      await this.stop();
    }

    if (this.starting) return;
    this.starting = true;
    this._workspacePath = workspacePath;
    this._workspaceName = name;
    this.setStatus('starting');
    invalidateManifestCache();

    let port: number | undefined;
    try {
      port = await findAvailablePort();
      this.server = await serve(workspacePath, {
        port,
        onError: (err, context) => {
          captureException(err, {
            tags: { component: 'workspace-server' },
            extras: { workspacePath, workspaceName: name, port, ...context },
          });

          const errorPayload: WorkspaceError = {
            type: context?.type ?? 'api',
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            file: context?.file,
            route: context?.route,
            method: context?.method,
            url: context?.url,
          };
          this.emit('error', errorPayload);

          // Manifest failures mean the workspace is invalid — surface immediately
          // instead of waiting for the health check to detect the 500.
          if (context?.route === '/api/manifest' && this._status === 'running') {
            this.clearHealthCheck();
            this.server = null;
            this.setStatus('error');
          }
        },
      });
      this.setStatus('running');
      this.startHealthCheck();
    } catch (err) {
      console.error('[workspace-manager] Failed to start:', err);
      captureException(err, {
        tags: { component: 'workspace-manager' },
        extras: { workspacePath, workspaceName: name, port },
      });
      this.server = null;
      this.setStatus('error');
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    this.clearHealthCheck();
    if (this.server) {
      try {
        await this.server.close();
      } catch {
        /* Server close — best-effort during shutdown */
      }
      this.server = null;
    }
    this._workspacePath = null;
    this._workspaceName = null;
    this.setStatus('stopped');
  }

  async switchWorkspace(workspacePath: string, name: string): Promise<void> {
    // Shut down the current server without emitting 'stopped' — go straight
    // to 'starting' so the renderer doesn't bounce back to the workspaces page.
    this.clearHealthCheck();
    if (this.server) {
      try {
        await this.server.close();
      } catch {
        /* Server close — best-effort during shutdown */
      }
      this.server = null;
    }
    // Clear the module-level manifest cache so the new server doesn't
    // return stale data from the previous workspace.
    invalidateManifestCache();
    await this.startWorkspace(workspacePath, name);
  }

  async createAndStart(targetPath: string, name: string): Promise<string> {
    const root = createWorkspace(targetPath, { name });
    await this.startWorkspace(root, name);
    return root;
  }

  getInfo(): WorkspaceServerInfo {
    return {
      status: this._status,
      port: this.server?.port,
      url: this.server?.url,
      workspacePath: this._workspacePath ?? undefined,
      workspaceName: this._workspaceName ?? undefined,
    };
  }

  private setStatus(status: WorkspaceServerStatus): void {
    this._status = status;
    this.emit('status-change', this.getInfo());
  }

  private startHealthCheck(): void {
    this.healthInterval = setInterval(async () => {
      if (this._status !== 'running' || !this.server) return;

      try {
        const res = await fetch(`${this.server.url}/api/manifest`, {
          signal: AbortSignal.timeout(3_000),
        });
        if (!res.ok) {
          let detail = '';
          try {
            const text = await res.text();
            try {
              const json = JSON.parse(text) as { error?: string };
              detail = json.error ?? text;
            } catch {
              detail = text;
            }
          } catch {
            /* ignore body read failure */
          }
          throw new Error(
            `Health check returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
          );
        }
      } catch (err) {
        /* Health check failed — status already checked above */
        if (this._status !== 'running') return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[workspace-manager] Health check failed:', message);
        const workspaceUrl = this.server?.url;
        this.server = null;
        this.clearHealthCheck();
        captureMessage('Workspace server health check failed', 'error', {
          tags: { component: 'workspace-manager' },
          extras: {
            workspacePath: this._workspacePath,
            workspaceName: this._workspaceName,
            workspaceUrl,
            error: message,
          },
        });
        this.setStatus('error');
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private clearHealthCheck(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = undefined;
    }
  }
}
