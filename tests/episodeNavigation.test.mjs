import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(new URL('../utils/episodeNavigation.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText,
  { exports }
);

const {
  normalizeEpisodeNumber,
  sortEpisodesAscending,
  getFirstEpisode,
  getAdjacentEpisodes,
  getNextEpisode,
  getPreviousEpisode,
} = exports;

test('sortEpisodesAscending orders numerically (0, 1, 1.5, 2, 10) without mutating input', () => {
  const input = [
    { number: 10 },
    { number: 2 },
    { number: 1.5 },
    { number: 1 },
    { number: 0 },
  ];
  const snapshot = input.map((ep) => ({ ...ep }));

  const sorted = sortEpisodesAscending(input);

  assert.deepEqual(
    Array.from(sorted, (ep) => ep.number),
    [0, 1, 1.5, 2, 10]
  );
  assert.deepEqual(input, snapshot);
});

test('getFirstEpisode selects lowest numeric episode from descending list without mutation', () => {
  const descending = [{ number: 12 }, { number: 10 }, { number: 2 }, { number: 1 }];
  const first = getFirstEpisode(descending);

  assert.equal(first?.number, 1);
  assert.equal(descending[0].number, 12);
});

test('getAdjacentEpisodes follows real episode numbers instead of +1 arithmetic', () => {
  const episodes = [{ number: 10 }, { number: 2.5 }, { number: 2 }, { number: 1 }];

  const adj1 = getAdjacentEpisodes(episodes, 1);
  assert.equal(adj1.previous, null);
  assert.equal(adj1.next?.number, 2);

  const adj2 = getAdjacentEpisodes(episodes, 2);
  assert.equal(adj2.previous?.number, 1);
  assert.equal(adj2.next?.number, 2.5);

  const adj25 = getAdjacentEpisodes(episodes, 2.5);
  assert.equal(adj25.previous?.number, 2);
  assert.equal(adj25.next?.number, 10);

  const adj10 = getAdjacentEpisodes(episodes, 10);
  assert.equal(adj10.previous?.number, 2.5);
  assert.equal(adj10.next, null);
});

test('getNextEpisode returns null on last episode and getPreviousEpisode returns null on first', () => {
  const episodes = [{ number: 1 }, { number: 3 }, { number: 7 }];

  assert.equal(getPreviousEpisode(episodes, 1), null);
  assert.equal(getNextEpisode(episodes, 7), null);
  assert.equal(getNextEpisode(episodes, 3)?.number, 7);
  assert.equal(getPreviousEpisode(episodes, 3)?.number, 1);
});

test('deduplicates repeated episode numbers and ignores invalid entries', () => {
  const episodes = [
    { number: 2 },
    { number: 1 },
    { number: 2 },
    { number: Number.NaN },
    { number: 10 },
  ];

  assert.deepEqual(
    Array.from(sortEpisodesAscending(episodes), (ep) => ep.number),
    [1, 2, 10]
  );
  assert.equal(getNextEpisode(episodes, 2)?.number, 10);
});

test('handles empty, nullish, or unknown current episode safely', () => {
  assert.equal(getFirstEpisode([]), null);
  assert.equal(getFirstEpisode(null), null);
  const emptyAdj = getAdjacentEpisodes([], 1);
  assert.equal(emptyAdj.previous, null);
  assert.equal(emptyAdj.next, null);
  const missingAdj = getAdjacentEpisodes([{ number: 1 }, { number: 2 }], 99);
  assert.equal(missingAdj.previous, null);
  assert.equal(missingAdj.next, null);
});

test('normalizeEpisodeNumber preserves decimals and rejects empty/non-numeric strings', () => {
  assert.equal(normalizeEpisodeNumber(5.5), 5.5);
  assert.equal(normalizeEpisodeNumber('12.5'), 12.5);
  assert.equal(normalizeEpisodeNumber('0'), 0);
  assert.equal(normalizeEpisodeNumber(''), null);
  assert.equal(normalizeEpisodeNumber('abc'), null);
  assert.equal(normalizeEpisodeNumber(Infinity), null);
});
