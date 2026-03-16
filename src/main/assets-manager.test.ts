import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listAssets } from './assets-manager';

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=',
  'base64',
);

describe('listAssets', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('includes nested files and image dimensions when recursive', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'litho-assets-test-'));
    tempDirs.push(workspacePath);

    await mkdir(join(workspacePath, 'assets', 'logos'), { recursive: true });
    await mkdir(join(workspacePath, 'assets', 'vectors'), { recursive: true });
    await writeFile(join(workspacePath, 'assets', 'logos', 'logo.png'), ONE_BY_ONE_PNG);
    await writeFile(
      join(workspacePath, 'assets', 'vectors', 'mark.svg'),
      '<svg width="320" height="180" viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" />',
    );

    const entries = listAssets(workspacePath, '', true);
    const pngEntry = entries.find((entry) => entry.path === 'logos/logo.png');
    const svgEntry = entries.find((entry) => entry.path === 'vectors/mark.svg');

    expect(pngEntry).toMatchObject({
      type: 'file',
      width: 1,
      height: 1,
    });
    expect(svgEntry).toMatchObject({
      type: 'file',
      width: 320,
      height: 180,
    });
  });
});
