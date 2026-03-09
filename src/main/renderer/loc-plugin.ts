import _generate from '@babel/generator';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

// Handle CJS/ESM interop for Babel packages
const traverse =
  typeof _traverse === 'function'
    ? _traverse
    : (_traverse as { default: typeof _traverse }).default;
const generate =
  typeof _generate === 'function'
    ? _generate
    : (_generate as { default: typeof _generate }).default;

/**
 * Inject `data-litho-loc="pageId:line:col"` attributes on every JSX opening
 * element (except Fragments) so the editor script can map DOM nodes back to
 * source locations.
 */
export function injectLocAttributes(source: string, pageId: string): string {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  traverse(ast, {
    JSXOpeningElement(path) {
      if (!path.node.loc) return;

      const name = path.node.name;
      if (t.isJSXIdentifier(name) && name.name === 'Fragment') return;
      if (
        t.isJSXMemberExpression(name) &&
        t.isJSXIdentifier(name.property) &&
        name.property.name === 'Fragment'
      )
        return;

      const { line, column } = path.node.loc.start;

      path.node.attributes.push(
        t.jsxAttribute(
          t.jsxIdentifier('data-litho-loc'),
          t.stringLiteral(`${pageId}:${line}:${column + 1}`),
        ),
      );
    },
  });

  const { code } = generate(ast, { retainLines: true });
  return code;
}
