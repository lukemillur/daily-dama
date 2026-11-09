import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

// Product rule: no text field autocorrects or spell-checks. `TextField` defaults both off, so
// this guard fails on any caller that opts back in, and on raw `styled(TextInput)` wrappers that
// do not turn autocorrect off themselves.

const GUARDED_TAGS = new Set(['TextField', 'TextInput']);
const GUARDED_PROPS = new Set(['autoCorrect', 'spellCheck']);

function isFalseLiteral(initializer: ts.JsxAttribute['initializer']): boolean {
  return (
    initializer !== undefined &&
    ts.isJsxExpression(initializer) &&
    initializer.expression?.kind === ts.SyntaxKind.FalseKeyword
  );
}

function findAutocorrectViolations(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];
  const report = (node: ts.Node, message: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    violations.push(`${fileName}:${line + 1} ${message}`);
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (GUARDED_TAGS.has(node.tagName.getText(file))) {
        for (const attr of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attr) &&
            GUARDED_PROPS.has(attr.name.getText(file)) &&
            !isFalseLiteral(attr.initializer)
          ) {
            report(attr, `${attr.name.getText(file)} must be {false}`);
          }
        }
      }
    }
    // `styled(TextInput)` wrappers must set autoCorrect: false through `.attrs`.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'styled' &&
      node.arguments[0]?.getText(file) === 'TextInput'
    ) {
      let statementNode: ts.Node = node;
      while (!ts.isVariableStatement(statementNode) && statementNode.parent) {
        statementNode = statementNode.parent;
      }
      const statement = statementNode.getText(file);
      // `TextField`'s own `Input` sets the props explicitly on its JSX element instead.
      const isTextFieldInput = /(^|\/)text-field\.tsx$/.test(fileName);
      if (!isTextFieldInput && !/\.attrs\([^]*autoCorrect:\s*false/.test(statement)) {
        report(node, 'styled(TextInput) must use .attrs({ autoCorrect: false, ... })');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return violations;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('no-autocorrect guard', () => {
  it('flags enabled autocorrect and unguarded styled inputs', () => {
    expect(findAutocorrectViolations('a.tsx', '<TextField autoCorrect />')).toHaveLength(1);
    expect(findAutocorrectViolations('a.tsx', '<TextInput autoCorrect={true} />')).toHaveLength(1);
    expect(findAutocorrectViolations('a.tsx', '<TextField spellCheck />')).toHaveLength(1);
    expect(
      findAutocorrectViolations('a.tsx', 'const A = styled(TextInput)`color: red;`;'),
    ).toHaveLength(1);
    expect(
      findAutocorrectViolations('a.tsx', '<TextField autoCorrect={false} spellCheck={false} />'),
    ).toEqual([]);
    expect(
      findAutocorrectViolations(
        'a.tsx',
        'const A = styled(TextInput).attrs({ autoCorrect: false, spellCheck: false })`color: red;`;',
      ),
    ).toEqual([]);
  });

  it('finds no autocorrect-enabled text input under src', () => {
    const violations = sourceFiles(join(process.cwd(), 'src')).flatMap((path) =>
      findAutocorrectViolations(path, readFileSync(path, 'utf8')),
    );
    expect(violations).toEqual([]);
  });
});
