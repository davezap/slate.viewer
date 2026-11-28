import test from 'node:test';
import assert from 'node:assert/strict';
import { isFormTemplate, newFileText, newNameOf, resolveTemplate, stripTemplateKeys, suggestedName, templateFileName, templatesOf } from '../src/lib/templates.ts';

// The same cases as Metatrash's templates_test.go: the two must agree.
test('resolveTemplate', () => {
  assert.equal(resolveTemplate('', '/Templates/a.md'), 'Templates/a.md');
  assert.equal(resolveTemplate('Meetings/', 'a.md'), 'Meetings/a.md');
  assert.equal(resolveTemplate('Meetings/2026/', '../a.md'), 'Meetings/a.md');
  assert.equal(resolveTemplate('Meetings/', './a.md'), 'Meetings/a.md');
  assert.equal(resolveTemplate('', '../a.md'), '');
  assert.equal(resolveTemplate('Meetings/', '../../a.md'), '');
});

test('stripTemplateKeys', () => {
  assert.equal(stripTemplateKeys('---\nnewName: "{{@today}} Meeting"\n---\n\n# Meeting\n'), '# Meeting\n');
  assert.equal(stripTemplateKeys('---\ntitle: Notes\nnewName: x\ntags: [a]\n---\nBody\n'), '---\ntitle: Notes\ntags: [a]\n---\nBody\n');
  assert.equal(stripTemplateKeys('---\nnewName: >\n  folded\ntitle: T\n---\nB'), '---\ntitle: T\n---\nB');
  assert.equal(stripTemplateKeys('# No front matter\n'), '# No front matter\n');
  assert.equal(stripTemplateKeys('---\r\nnewName: x\r\nkeep: y\r\n---\r\nBody\r\n'), '---\r\nkeep: y\r\n---\r\nBody\r\n');
  assert.equal(stripTemplateKeys('---\nunclosed: yes\n'), '---\nunclosed: yes\n');
  assert.equal(templateFileName(' 2026-11-28 / Board: notes. '), '2026-11-28 - Board- notes');
});

test('templatesOf follows inherit and resolves from the folder that sets it', () => {
  const texts = new Map([
    ['', '{}'],
    ['Meetings/', '{"templates": ["/Templates/meeting.md", "/Templates/decision.md"], "defaultTemplate": "/Templates/meeting.md"}'],
    ['Meetings/2026/', '{"inherit": true}'],
    ['Other/', '{"inherit": true, "templates": ["../Templates/decision.md"]}'],
  ]);
  assert.deepEqual(templatesOf(texts, 'Meetings/2026/'), { templates: ['Templates/meeting.md', 'Templates/decision.md'], defaultTemplate: 'Templates/meeting.md' });
  assert.deepEqual(templatesOf(texts, 'Other/'), { templates: ['Templates/decision.md'], defaultTemplate: '' });
  // A folder with no settings file inherits.
  assert.deepEqual(templatesOf(texts, 'Meetings/new/'), templatesOf(texts, 'Meetings/'));
  texts.set('Meetings/2026/', '{"inherit": true, "defaultTemplate": ""}');
  assert.equal(templatesOf(texts, 'Meetings/2026/').defaultTemplate, '');
});

test('filling a template', () => {
  const template = '---\nnewName: "{{@today}} Meeting"\n---\n\n# {{@title}}\n\nDate: {{@today}} at {{ @now }}\nBy: {{@name}} <{{@email}}>\nKeep {{@other}} and {{text name=x}}.\n';
  const v = { today: '2026-11-28', now: '09:30', name: 'dave', email: '' };
  assert.equal(newNameOf(template), '{{@today}} Meeting');
  assert.equal(suggestedName(template, v), '2026-11-28 Meeting');
  assert.equal(suggestedName('---\nnewName: At {{@now}} {{@title}}\n---\n', v), 'At 09.30');
  assert.equal(newFileText(template, { ...v, title: '2026-11-28 Meeting' }),
    '# 2026-11-28 Meeting\n\nDate: 2026-11-28 at 09:30\nBy: dave <>\nKeep {{@other}} and {{text name=x}}.\n');
  assert.equal(isFormTemplate('---\nform: leave\nsubmitTo: done/\n---\n'), true);
  assert.equal(isFormTemplate('---\nform: leave\nsubmittedAt: x\n---\n'), false);
  assert.equal(isFormTemplate('# Notes\n'), false);
});
