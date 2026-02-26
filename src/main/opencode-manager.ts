import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { createOpencode } from '@opencode-ai/sdk';
import { app } from 'electron';
import { agentConfigs } from '../agents/index';
import type { OpencodeInfo, OpencodeStatus } from '../shared/types';
import { captureException, captureMessage } from './sentry';

export type { OpencodeInfo, OpencodeStatus };

const MAX_CRASH_COUNT = 5;
const MAX_BACKOFF_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 5_000;
const PROCESS_KILL_WAIT_MS = 2_000;
const PROCESS_KILL_POLL_MS = 200;

async function waitForPortClose(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(500),
      });
      await res.body?.cancel();
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, PROCESS_KILL_POLL_MS));
  }
  return false;
}

function forceKillByPort(port: number): void {
  const myPid = process.pid;
  try {
    const pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf-8' }).trim();
    if (pids) {
      for (const pid of pids.split('\n')) {
        const n = Number(pid);
        if (n === myPid) continue;
        try {
          process.kill(n, 'SIGKILL');
        } catch {
          /* Process already exited */
        }
      }
    }
  } catch {
    /* PID not found or lsof unavailable */
  }
}

export class OpencodeManager extends EventEmitter {
  private opencode: Awaited<ReturnType<typeof createOpencode>> | null = null;
  private abortController: AbortController | null = null;
  private _status: OpencodeStatus = 'stopped';
  private port: number | null = null;
  private startedAt: number | null = null;
  private crashCount = 0;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private healthInterval?: ReturnType<typeof setInterval>;
  private starting = false;

  async start(): Promise<void> {
    if (this.starting || this._status === 'running') return;
    this.starting = true;

    this.setStatus('starting');

    try {
      this.abortController = new AbortController();

      const pluginDir = app.isPackaged
        ? join(process.resourcesPath, 'opencode-plugin')
        : join(app.getAppPath(), 'resources', 'opencode-plugin');
      const pluginUrl = `file://${join(pluginDir, 'litho-tools.mjs')}`;

      const opencode = await createOpencode({
        port: 0,
        timeout: 15_000,
        signal: this.abortController.signal,
        config: {
          agent: agentConfigs,
          plugin: [pluginUrl],
        },
      });
      this.opencode = opencode;

      const url = new URL(opencode.server.url);
      this.port = Number.parseInt(url.port, 10);
      this.startedAt = Date.now();
      this.crashCount = 0;
      this.setStatus('running');

      this.startHealthCheck();
    } catch (err) {
      console.error('[opencode-manager] Failed to start:', err);
      this.opencode = null;
      this.abortController = null;
      this.crashCount++;

      captureException(err, {
        tags: { component: 'opencode-manager' },
        extras: { crashCount: this.crashCount, willRetry: this.crashCount < MAX_CRASH_COUNT },
      });

      if (this.crashCount >= MAX_CRASH_COUNT) {
        this.setStatus('failed');
        return;
      }

      this.setStatus('crashed');
      this.scheduleRestart();
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    this.clearTimers();

    const portToWait = this.port;

    if (this.opencode) {
      // 1. SDK's close() sends SIGTERM via proc.kill()
      try {
        this.opencode.server.close();
      } catch {
        /* Graceful shutdown — best-effort */
      }
      this.opencode = null;
    }

    // 2. Abort the controller (another SIGTERM path via Node.js spawn signal)
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        /* Graceful shutdown — best-effort */
      }
      this.abortController = null;
    }

    // 3. Wait for the process to actually die
    if (portToWait) {
      const closed = await waitForPortClose(portToWait, PROCESS_KILL_WAIT_MS);
      // 4. If still alive, force kill with SIGKILL
      if (!closed) {
        console.warn(`[opencode-manager] Process on port ${portToWait} didn't exit, force killing`);
        forceKillByPort(portToWait);
        await waitForPortClose(portToWait, 1_000);
      }
    }

    this.port = null;
    this.startedAt = null;
    this.setStatus('stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    this.crashCount = 0;
    await this.start();
  }

  getStatus(): OpencodeInfo {
    return {
      status: this._status,
      port: this.port ?? undefined,
      uptime: this.startedAt ? Date.now() - this.startedAt : undefined,
    };
  }

  private setStatus(status: OpencodeStatus): void {
    this._status = status;
    this.emit('status-change', this.getStatus());
  }

  private startHealthCheck(): void {
    this.healthInterval = setInterval(async () => {
      if (this._status !== 'running' || !this.opencode || this.starting) return;

      try {
        const res = await fetch(this.opencode.server.url, {
          signal: AbortSignal.timeout(3_000),
        });
        if (!res.ok) throw new Error(`Health check returned ${res.status}`);
      } catch {
        if (this._status !== 'running' || !this.opencode) return;
        console.warn('[opencode-manager] Health check failed, server may have crashed');
        captureMessage('OpenCode server crash detected via health check', 'warning', {
          tags: { component: 'opencode-manager' },
          extras: { crashCount: this.crashCount, port: this.port },
        });
        this.handleCrash();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private handleCrash(): void {
    this.clearTimers();

    if (this.opencode) {
      try {
        this.opencode.server.close();
      } catch {
        /* Crash cleanup — best-effort */
      }
      this.opencode = null;
    }
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        /* Crash cleanup — best-effort */
      }
      this.abortController = null;
    }

    this.crashCount++;

    const isPermanentFailure = this.crashCount >= MAX_CRASH_COUNT;
    captureMessage(
      isPermanentFailure
        ? 'OpenCode server failed permanently'
        : 'OpenCode server crashed, scheduling restart',
      isPermanentFailure ? 'error' : 'warning',
      {
        tags: { component: 'opencode-manager' },
        extras: { crashCount: this.crashCount, port: this.port },
      },
    );

    this.port = null;
    this.startedAt = null;

    if (isPermanentFailure) {
      this.setStatus('failed');
      return;
    }

    this.setStatus('crashed');
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    const backoff = Math.min(2 ** (this.crashCount - 1) * 1000, MAX_BACKOFF_MS);
    this.restartTimer = setTimeout(() => {
      this.start();
    }, backoff);
  }

  private clearTimers(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = undefined;
    }
  }
}
