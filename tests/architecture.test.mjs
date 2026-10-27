import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseSync } from 'vite';

test('main keeps initialization inside functions with only one top-level entry call', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  const { program } = parseSync('main.ts', source);
  const declarations = new Set(['ImportDeclaration', 'TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'FunctionDeclaration']);
  const executable = program.body.filter(statement => !declarations.has(statement.type));
  assert.equal(executable.length, 1);
  const entry = executable[0];
  assert.equal(entry.type, 'ExpressionStatement');
  assert.equal(entry.expression.type, 'CallExpression');
  assert.equal(entry.expression.callee.name, 'startGame');
  assert.equal(entry.expression.arguments.length, 0);
});
