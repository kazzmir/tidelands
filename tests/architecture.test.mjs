import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('main keeps initialization inside functions with only one top-level entry call', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  const module = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const executable = module.statements.filter(statement =>
    !ts.isImportDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)
    && !ts.isInterfaceDeclaration(statement) && !ts.isFunctionDeclaration(statement),
  );
  assert.equal(executable.length, 1);
  const entry = executable[0];
  assert.ok(ts.isExpressionStatement(entry) && ts.isCallExpression(entry.expression));
  assert.equal(entry.expression.expression.getText(module), 'startGame');
  assert.equal(entry.expression.arguments.length, 0);
});
