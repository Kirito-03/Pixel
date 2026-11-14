import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db.js';
import catalogRouter from '../routes/catalog.js';
import { normalizeTrailer, extractYouTubeId } from '../services/anilistService.js';
import {
  normalizeTitle,
  hasExactNormalizedTitleMatch,
  parseBackfillArgs,
  runBackfillTrailers,
} from '../tools/backfill-trailers.mjs';

test('normalizeTrailer acepta solo YouTube con ID seguro de 11 caracteres', () => {
  assert.deepEqual(
    normalizeTrailer({ id: 'dQw4w9WgXcQ', site: 'youtube' }),
    { trailer_id: 'dQw4w9WgXcQ', trailer_site: 'youtube' }
  );

  assert.deepEqual(
    normalizeTrailer({ id: 'abc_DEF-123', site: 'YouTube' }),
    { trailer_id: 'abc_DEF-123', trailer_site: 'youtube' }
  );

  // Jikan format
  assert.deepEqual(
    normalizeTrailer({
      youtube_id: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embed_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1',
    }),
    { trailer_id: 'dQw4w9WgXcQ', trailer_site: 'youtube' }
  );

  // Jikan sin youtube_id pero con embed_url válida de YouTube
  assert.deepEqual(
    normalizeTrailer({
      youtube_id: null,
      embed_url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0',
    }),
    { trailer_id: 'dQw4w9WgXcQ', trailer_site: 'youtube' }
  );
});

test('normalizeTrailer y extractYouTubeId rechazan sitios distintos, URLs hostiles e IDs inválidos', () => {
  assert.deepEqual(
    normalizeTrailer({ id: 'dQw4w9WgXcQ', site: 'dailymotion' }),
    { trailer_id: null, trailer_site: null }
  );

  assert.deepEqual(
    normalizeTrailer({ id: 'short', site: 'youtube' }),
    { trailer_id: null, trailer_site: null }
  );

  assert.deepEqual(
    normalizeTrailer({ id: 'dQw4w9WgXcQ<script>', site: 'youtube' }),
    { trailer_id: null, trailer_site: null }
  );

  assert.deepEqual(
    normalizeTrailer({ url: 'https://evil.example/watch?v=dQw4w9WgXcQ' }),
    { trailer_id: null, trailer_site: null }
  );

  assert.equal(extractYouTubeId('javascript:alert(1)'), null);
  assert.equal(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=toolong123456'), null);
});

test('normalizeTitle y hasExactNormalizedTitleMatch exigen coincidencia exacta normalizada', () => {
  assert.equal(normalizeTitle('  Steins;Gate  '), 'steins gate');
  assert.equal(
    hasExactNormalizedTitleMatch(
      { title: 'Steins;Gate', title_english: 'Steins;Gate' },
      { title: 'Steins Gate', title_english: '', title_romaji: 'STEINS;GATE' }
    ),
    true
  );

  assert.equal(
    hasExactNormalizedTitleMatch(
      { title: 'Attack on Titan Season 2', title_english: 'Attack on Titan Season 2' },
      { title: 'Attack on Titan', title_english: 'Attack on Titan', title_romaji: 'Shingeki no Kyojin' }
    ),
    false
  );
});

test('parseBackfillArgs aplica techo máximo de 10 en --limit', () => {
  assert.deepEqual(parseBackfillArgs([]), { limit: 10 });
  assert.deepEqual(parseBackfillArgs(['--limit', '4']), { limit: 4 });
  assert.deepEqual(parseBackfillArgs(['--limit=7']), { limit: 7 });
  assert.deepEqual(parseBackfillArgs(['--limit', '50']), { limit: 10 });
  assert.deepEqual(parseBackfillArgs(['--limit=0']), { limit: 10 });
  assert.deepEqual(parseBackfillArgs(['--limit=-3']), { limit: 10 });
});

test('runBackfillTrailers consulta 1 vez por registro, guarda solo match exacto y registra ausencia sin sobrescribir manual', async () => {
  const queries = [];
  const rows = [
    { id: 1, title: 'Frieren', title_english: "Frieren: Beyond Journey's End", trailer_id: null },
    { id: 2, title: 'Anime Distinto', title_english: '', trailer_id: null },
    { id: 3, title: 'Sin Trailer', title_english: '', trailer_id: null },
    { id: 4, title: 'Con Manual', title_english: '', trailer_id: 'manual12345' },
  ];

  const mockPool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('SELECT id, title')) {
        return { rows };
      }
      return { rowCount: 1, rows: [] };
    },
  };

  const providerCalls = [];
  const mockProvider = async (q) => {
    providerCalls.push(q);
    if (q.includes('Frieren')) {
      return {
        title: 'Sousou no Frieren',
        title_english: "Frieren: Beyond Journey's End",
        trailer_id: 'ZEkwCGJ3o7M',
        trailer_site: 'youtube',
      };
    }
    if (q === 'Anime Distinto') {
      return {
        title: 'Anime Distinto Season 2',
        title_english: 'Anime Distinto Season 2',
        trailer_id: 'dQw4w9WgXcQ',
        trailer_site: 'youtube',
      };
    }
    return {
      title: 'Sin Trailer',
      title_english: 'Sin Trailer',
      trailer_id: null,
      trailer_site: null,
    };
  };

  const summary = await runBackfillTrailers({
    dbPool: mockPool,
    provider: mockProvider,
    limit: 99,
  });

  // Límite parametrizado con techo 10
  assert.deepEqual(queries[0].params, [10]);
  // Solo 1 llamada al proveedor por registro sin tráiler manual (IDs 1, 2, 3)
  assert.equal(providerCalls.length, 3);
  assert.deepEqual(summary, {
    processed: 4,
    updated: 1,
    checkedNoTrailer: 2,
    skippedManual: 1,
    errors: 0,
  });

  // ID 1 guardó trailer_id y trailer_site con condición de no sobrescribir manual
  const update1 = queries.find((q) => q.params?.includes(1) && q.sql.includes('SET trailer_id'));
  assert.ok(update1);
  assert.deepEqual(update1.params, ['ZEkwCGJ3o7M', 'youtube', 1]);
  assert.ok(update1.sql.includes("trailer_id IS NULL OR trailer_id = ''"));

  // ID 2 (título no exacto) e ID 3 (sin trailer) registraron trailer_checked_at sin guardar trailer_id
  const check2 = queries.find((q) => q.params?.length === 1 && q.params[0] === 2 && q.sql.includes('trailer_checked_at = NOW()'));
  const check3 = queries.find((q) => q.params?.length === 1 && q.params[0] === 3 && q.sql.includes('trailer_checked_at = NOW()'));
  assert.ok(check2);
  assert.ok(check3);
});

const originalQuery = pool.query.bind(pool);
const app = express();
app.use('/api/catalog', catalogRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  pool.query = originalQuery;
  await new Promise((resolve) => server.close(resolve));
});

test('catalog list y detail entregan trailer_id, trailer_site y trailer_checked_at', async () => {
  const sampleRow = {
    id: 42,
    tmdb_id: null,
    title: 'Frieren',
    franchise_key: 'frieren',
    title_english: "Frieren: Beyond Journey's End",
    title_japanese: '葬送のフリーレン',
    description: 'Test',
    poster_url: 'https://example.com/p.jpg',
    banner_url: 'https://example.com/b.jpg',
    genres: ['Adventure'],
    status: 'Finished',
    total_episodes: 28,
    rating: 9.1,
    release_date: '2023-09-29',
    trailer_id: 'ZEkwCGJ3o7M',
    trailer_site: 'youtube',
    trailer_checked_at: '2026-11-13T00:00:00.000Z',
    created_at: '2026-11-13T00:00:00.000Z',
  };

  pool.query = async (sql) => {
    if (sql.includes('COUNT(*)')) {
      return { rows: [{ count: 1 }] };
    }
    return { rows: [sampleRow] };
  };

  const listRes = await fetch(`${base}/api/catalog/anime`);
  assert.equal(listRes.status, 200);
  const listJson = await listRes.json();
  assert.equal(listJson.data[0].trailer_id, 'ZEkwCGJ3o7M');
  assert.equal(listJson.data[0].trailer_site, 'youtube');
  assert.equal(listJson.data[0].trailer_checked_at, '2026-11-13T00:00:00.000Z');

  const detailRes = await fetch(`${base}/api/catalog/anime/42`);
  assert.equal(detailRes.status, 200);
  const detailJson = await detailRes.json();
  assert.equal(detailJson.trailer_id, 'ZEkwCGJ3o7M');
  assert.equal(detailJson.trailer_site, 'youtube');
  assert.equal(detailJson.trailer_checked_at, '2026-11-13T00:00:00.000Z');
});
