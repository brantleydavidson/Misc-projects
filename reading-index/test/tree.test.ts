import assert from 'node:assert/strict';
import test from 'node:test';
import { openingSummary } from '../src/summary.ts';
import { buildNodes } from '../src/tree.ts';

const article = `# Animals

Animals intro.

## Cats

Cats are small.

## Dogs

Dogs are loyal.

# Plants

Plants grow.
`;

test('a page splits on headings into a section tree', () => {
  const nodes = buildNodes({
    documentId: 'doc',
    title: 'Field guide',
    text: `Intro paragraph.\n\n${article}`,
    sourceKind: 'page',
  });
  const root = nodes.find((node) => node.parentId === null);
  assert.ok(root);
  assert.equal(root.title, 'Field guide');
  assert.equal(root.body, 'Intro paragraph.');
  assert.equal(root.summary, openingSummary(root.body));

  const animals = nodes.find((node) => node.title === 'Animals');
  const plants = nodes.find((node) => node.title === 'Plants');
  const cats = nodes.find((node) => node.title === 'Cats');
  const dogs = nodes.find((node) => node.title === 'Dogs');
  assert.ok(animals && plants && cats && dogs);
  assert.equal(animals.parentId, root.id);
  assert.equal(plants.parentId, root.id);
  assert.equal(cats.parentId, animals.id);
  assert.equal(dogs.parentId, animals.id);
  assert.equal(cats.body, 'Cats are small.');
  assert.equal(dogs.body, 'Dogs are loyal.');
  assert.equal(animals.position, 0);
  assert.equal(plants.position, 1);
  assert.equal(cats.summary, 'Cats are small.');
  assert.equal(root.pageStart, 1);
  assert.ok((plants.pageStart ?? 1) >= 1);
});

test('a selection is a single node even when it contains headings', () => {
  const text = '# Not a section\n\nJust a highlight from the page.';
  const nodes = buildNodes({
    documentId: 'doc',
    title: 'Highlight',
    text,
    sourceKind: 'selection',
  });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].parentId, null);
  assert.equal(nodes[0].title, 'Highlight');
  assert.equal(nodes[0].body, text.trim());
  assert.equal(nodes[0].pageStart, 1);
  assert.equal(nodes[0].pageEnd, 1);
});

test('a page without headings is one node and long text spans pages', () => {
  const text = 'word '.repeat(2000).trim();
  const nodes = buildNodes({
    documentId: 'doc',
    title: 'Notes',
    text,
    sourceKind: 'page',
  });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].body, text);
  assert.equal(nodes[0].pageStart, 1);
  assert.ok((nodes[0].pageEnd ?? 1) > 1);
  assert.equal(nodes[0].summary, openingSummary(text));
});
