import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_STREAM_URL,
  buildInventoryMap,
  verifyAgainstInventory,
  canSafelyApplyRepair,
  buildRestorePlan,
  extractDriveRelPath,
  parseMangaChapterUrl,
} from '../tools/lib/drive-verify.mjs';

test('extractDriveRelPath and parseMangaChapterUrl handle stream URLs cleanly', () => {
  assert.equal(
    extractDriveRelPath('https://pixelnosekai.com/api/stream/Anime/12/3/episode.mp4'),
    'Anime/12/3/episode.mp4'
  );
  assert.equal(
    extractDriveRelPath('https://pixelnosekai.com/api/stream/Manga/el-asesino/chapters/capitulo-10/001.jpg?v=2'),
    'Manga/el-asesino/chapters/capitulo-10/001.jpg'
  );
  assert.deepEqual(
    parseMangaChapterUrl('https://dragontranslation.org/manga/el-asesino/capitulo-10/'),
    { mangaId: 'el-asesino', chapterSlug: 'capitulo-10' }
  );
});

test('canSafelyApplyRepair refuses catastrophic DB wipe when Drive listing is empty or 100% fails', () => {
  const emptyRemote = canSafelyApplyRepair({
    dbLinkedCount: 40,
    inventorySize: 0,
    verifiedOkCount: 0,
    brokenCount: 40,
  });
  assert.equal(emptyRemote.safe, false);
  assert.match(emptyRemote.reason, /vacío/i);

  const totalFailure = canSafelyApplyRepair({
    dbLinkedCount: 15,
    inventorySize: 300,
    verifiedOkCount: 0,
    brokenCount: 15,
  });
  assert.equal(totalFailure.safe, false);
  assert.match(totalFailure.reason, /seguridad/i);

  const partialRepair = canSafelyApplyRepair({
    dbLinkedCount: 15,
    inventorySize: 300,
    verifiedOkCount: 14,
    brokenCount: 1,
  });
  assert.equal(partialRepair.safe, true);
});

test('verifyAgainstInventory detects only missing files and leaves intact files untouched', () => {
  const inventory = buildInventoryMap([
    { Path: 'Anime/1/1/episode.mp4', Size: 250_000_000 },
    { Path: 'Anime/1/1/thumb.jpg', Size: 42_000 },
    { Path: 'Anime/1/trailer.mp4', Size: 8_000_000 },
    { Path: 'Hentai/3/1/episode.mp4', Size: 180_000_000 },
    { Path: 'Manga/slug-a/chapters/cap-1/001.jpg', Size: 120_000 },
    { Path: 'Manga/slug-a/chapters/cap-1/002.jpg', Size: 130_000 },
  ]);

  const plan = verifyAgainstInventory(inventory, {
    animeEpisodes: [
      {
        id: 10,
        anime_id: 1,
        episode_number: 1,
        stream_url: `${BASE_STREAM_URL}/Anime/1/1/episode.mp4`,
        storage_type: 'gdrive',
        thumbnail_url: `${BASE_STREAM_URL}/Anime/1/1/thumb.jpg`,
        external_servers: [{ server: 'Pixel VIP (Drive)', url: `${BASE_STREAM_URL}/Anime/1/1/episode.mp4` }],
      },
      {
        id: 11,
        anime_id: 1,
        episode_number: 2,
        stream_url: `${BASE_STREAM_URL}/Anime/1/2/episode.mp4`,
        storage_type: 'gdrive',
        video_url: 'https://mp4upload.com/ep2',
        external_servers: [
          { server: 'Pixel VIP (Drive)', url: `${BASE_STREAM_URL}/Anime/1/2/episode.mp4` },
          { server: 'MP4Upload', url: 'https://mp4upload.com/ep2' },
        ],
      },
    ],
    animeTrailers: [{ id: 1, trailer_id: 'yt123', trailer_site: 'gdrive' }],
    hentaiEpisodes: [
      {
        id: 20,
        hentai_id: 3,
        episode_number: 1,
        video_servers: [{ server: 'Pixel VIP (Drive)', url: `${BASE_STREAM_URL}/Hentai/3/1/episode.mp4` }],
      },
    ],
    mangaChapters: [
      {
        chapter_url: 'https://dragontranslation.org/manga/slug-a/cap-1/',
        pages: [
          `${BASE_STREAM_URL}/Manga/slug-a/chapters/cap-1/001.jpg`,
          `${BASE_STREAM_URL}/Manga/slug-a/chapters/cap-1/002.jpg`,
        ],
      },
      {
        chapter_url: 'https://dragontranslation.org/manga/slug-a/cap-2/',
        pages: [
          `${BASE_STREAM_URL}/Manga/slug-a/chapters/cap-2/001.jpg`,
        ],
      },
    ],
  });

  assert.equal(plan.stats.checked, 6);
  assert.equal(plan.stats.ok, 4);
  assert.equal(plan.stats.brokenCount, 2);
  assert.deepEqual(plan.brokenAnimeEpisodes.map((b) => b.id), [11]);
  assert.deepEqual(plan.brokenAnimeEpisodes[0].cleanedServers, [
    { server: 'MP4Upload', url: 'https://mp4upload.com/ep2' },
  ]);
  assert.deepEqual(plan.brokenMangaChapters.map((b) => b.chapter_url), [
    'https://dragontranslation.org/manga/slug-a/cap-2/',
  ]);
});

test('buildRestorePlan re-links intact Drive media back to PostgreSQL while skipping incomplete manga chapters', () => {
  const inventory = buildInventoryMap([
    { Path: 'Anime/1/1/episode.mp4', Size: 250_000_000 },
    { Path: 'Anime/1/1/thumb.jpg', Size: 40_000 },
    { Path: 'Anime/1/trailer.mp4', Size: 9_000_000 },
    { Path: 'Hentai/4/2/episode.mp4', Size: 160_000_000 },
    { Path: 'Manga/my-manga/chapters/capitulo-1/001.jpg', Size: 100_000 },
    { Path: 'Manga/my-manga/chapters/capitulo-1/002.jpg', Size: 105_000 },
    // Chapter 2 is missing page 002 (gap 1 -> 3): must be skipped!
    { Path: 'Manga/my-manga/chapters/capitulo-2/001.jpg', Size: 100_000 },
    { Path: 'Manga/my-manga/chapters/capitulo-2/003.jpg', Size: 100_000 },
    // Chapter 3 has fewer pages than DB expects (2 vs 5): must be skipped!
    { Path: 'Manga/my-manga/chapters/capitulo-3/001.jpg', Size: 100_000 },
    { Path: 'Manga/my-manga/chapters/capitulo-3/002.jpg', Size: 100_000 },
  ]);

  const plan = buildRestorePlan(inventory, {
    animeEpisodes: [
      {
        id: 100,
        anime_id: 1,
        episode_number: 1,
        stream_url: null,
        storage_type: 'external',
        file_size: 0,
        external_servers: [{ server: 'MP4Upload', url: 'https://mp4upload.com/x' }],
        thumbnail_url: null,
      },
    ],
    animeContent: [{ id: 1, trailer_site: 'youtube' }],
    hentaiEpisodes: [
      {
        id: 200,
        hentai_id: 4,
        episode_number: 2,
        video_servers: [{ server: 'MP4Upload', url: 'https://mp4upload.com/h' }],
      },
    ],
    mangaChaptersCache: [
      {
        manga_id: 'my-manga',
        chapter_id: 'c1',
        external_url: 'https://dragontranslation.org/manga/my-manga/capitulo-1/',
        pages: 2,
      },
      {
        manga_id: 'my-manga',
        chapter_id: 'c2',
        external_url: 'https://dragontranslation.org/manga/my-manga/capitulo-2/',
        pages: null,
      },
      {
        manga_id: 'my-manga',
        chapter_id: 'c3',
        external_url: 'https://dragontranslation.org/manga/my-manga/capitulo-3/',
        pages: 5,
      },
    ],
  });

  assert.equal(plan.restoreAnimeEpisodes.length, 1);
  assert.equal(plan.restoreAnimeEpisodes[0].streamUrl, `${BASE_STREAM_URL}/Anime/1/1/episode.mp4`);
  assert.equal(plan.restoreAnimeEpisodes[0].thumbnailUrl, `${BASE_STREAM_URL}/Anime/1/1/thumb.jpg`);
  assert.equal(plan.restoreAnimeEpisodes[0].externalServers[0].server, 'Pixel VIP (Drive)');
  assert.equal(plan.restoreTrailers.length, 1);
  assert.equal(plan.restoreHentaiEpisodes.length, 1);
  assert.equal(plan.restoreHentaiEpisodes[0].videoServers[0].server, 'Pixel VIP (Drive)');
  assert.equal(plan.restoreMangaChapters.length, 1);
  assert.deepEqual(plan.restoreMangaChapters[0].pages, [
    `${BASE_STREAM_URL}/Manga/my-manga/chapters/capitulo-1/001.jpg`,
    `${BASE_STREAM_URL}/Manga/my-manga/chapters/capitulo-1/002.jpg`,
  ]);
  assert.equal(plan.skippedIncompleteManga.length, 2);
});
