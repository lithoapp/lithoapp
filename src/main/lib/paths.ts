import { createRequire } from 'node:module';
import { join } from 'node:path';
import { app } from 'electron';

export function getAppRootPath(): string {
  return app.getAppPath();
}

export function getAppPackageJsonPath(): string {
  return join(getAppRootPath(), 'package.json');
}

export function getAppNodeModulesPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : join(getAppRootPath(), 'node_modules');
}

export function createAppRequire(): NodeJS.Require {
  const baseRequire = createRequire(getAppPackageJsonPath());
  const appNodeModulesPath = getAppNodeModulesPath();
  const resolve: NodeJS.RequireResolve = Object.assign(
    (specifier: string, options?: NodeJS.RequireResolveOptions) =>
      baseRequire.resolve(specifier, {
        ...options,
        paths: [...(options?.paths ?? []), appNodeModulesPath],
      }),
    { paths: baseRequire.resolve.paths.bind(baseRequire.resolve) },
  );

  const appRequire = ((specifier: string) =>
    baseRequire(baseRequire.resolve(specifier, { paths: [appNodeModulesPath] }))) as NodeJS.Require;
  appRequire.resolve = resolve;

  return appRequire;
}
