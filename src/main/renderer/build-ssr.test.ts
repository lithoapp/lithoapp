import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
}));

import { buildPageSsr } from './build-ssr';

describe('buildPageSsr', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('renders pages that use hooks and context during SSR', async () => {
    const wsPath = await mkdtemp(join(tmpdir(), 'litho-ssr-test-'));
    tempDirs.push(wsPath);

    const pageSource = `
      import { createContext, useContext, useState } from 'react';

      const CountContext = createContext('missing');

      function Inner() {
        const value = useContext(CountContext);
        const [count] = useState(2);
        return <p>{value}-{count}</p>;
      }

      export default function Page() {
        return (
          <CountContext.Provider value="ready">
            <section>
              <Inner />
            </section>
          </CountContext.Provider>
        );
      }
    `;

    const { html } = await buildPageSsr(wsPath, pageSource, '@import "tailwindcss";', {
      width: 600,
      height: 400,
      unit: 'px',
    });

    expect(html).toContain('ready-2');
    expect(html).toContain('width:600px');
    expect(html).toContain('height:400px');
  });
});
