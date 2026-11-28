import test from 'node:test';
import assert from 'node:assert/strict';
import { failedLabel, failedWhere, summary } from '../src/lib/activity.ts';

// 0.51.0: the line at the top of Files says what failed, in words, instead of "6 failed".
test('failedLabel names what failed', () => {
  const conv = path => ({ kind: 'conversion', path, state: 'failed', message: 'x' });
  assert.equal(failedLabel([]), '');
  assert.equal(failedLabel([conv('a.pdf')]), "1 file couldn't be converted");
  assert.equal(failedLabel([conv('a.pdf'), conv('b.docx')]), "2 files couldn't be converted");
  assert.equal(failedLabel([{ kind: 'agent', folder: 'news/', action: 'news', state: 'failed', message: 'x' }]), '1 folder action failed');
  assert.equal(failedLabel([conv('a.pdf'), { kind: 'agent', path: 'b.md', state: 'failed', message: 'x' }]), '2 problems');
  assert.equal(failedLabel([conv('a.pdf'), { kind: 'conversion', path: 'b.pdf', state: 'converting', message: '' }]), "1 file couldn't be converted");
});

test('summary no longer counts failures', () => {
  assert.deepEqual(summary([{ kind: 'conversion', path: 'a.pdf', state: 'failed', message: 'x' }], Date.now()), []);
});

test('failedWhere', () => {
  assert.equal(failedWhere({ kind: 'agent', folder: 'news/', state: 'failed', message: '' }), 'news/');
  assert.equal(failedWhere({ kind: 'conversion', path: 'docs/a.pdf', state: 'failed', message: '' }), 'docs/a.pdf');
});
