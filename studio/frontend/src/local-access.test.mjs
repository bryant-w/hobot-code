import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {DEFAULT_LOCAL_ACCESS, readLocalAccess, saveLocalAccess} from './local-access.js';

function storage() {
  const values = new Map();
  return {getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
}

test('Mac local access defaults to full read and persists per board task', () => {
  const store = storage();
  assert.equal(DEFAULT_LOCAL_ACCESS, 'full-read');
  assert.equal(readLocalAccess(store, 's600', 'task-a'), 'full-read');
  saveLocalAccess(store, 's600', 'task-a', 'none');
  assert.equal(readLocalAccess(store, 's600', 'task-a'), 'none');
  assert.equal(readLocalAccess(store, 's600', 'task-b'), 'full-read');
  assert.throws(() => saveLocalAccess(store, 's600', 'task-a', 'write'));
});

test('Studio exposes Mac access beside board and network permissions', async () => {
  const source = await readFile(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(source, /<span>Mac access<\/span>/);
  assert.match(source, /value="full-read">All files \(read only\)/);
  assert.match(source, /api\.prepareLocalPrompt/);
});
