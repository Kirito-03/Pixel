const QUERY = `query ($id: Int) { Media(id: $id, type: ANIME) { id isAdult title { romaji english native } description(asHtml: false) coverImage { large extraLarge } bannerImage genres status episodes averageScore startDate { year month day } } }`;
export function createLegacyAnimeResolver({ pool, fetchMedia = fetch }) {
  const pending = new Map();
  return async function resolveLegacyAnime(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) return null;
    const cached = await pool.query('SELECT payload FROM legacy_anime_metadata WHERE anilist_id = $1 AND expires_at > NOW()', [id]);
    if (cached.rows.length) return cached.rows[0].payload;
    if (pending.has(id)) return pending.get(id);
    if (pending.size >= 8) throw new Error('Demasiadas consultas de metadatos. Intenta nuevamente.');
    const task = (async () => {
      const response = await fetchMedia('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: AbortSignal.timeout(12000), body: JSON.stringify({ query: QUERY, variables: { id } }),
      });
      if (!response.ok && response.status !== 404) throw new Error('No se pudieron consultar los metadatos antiguos.');
      const json = await response.json();
      if (json.errors && response.status !== 404) throw new Error('Metadatos antiguos temporalmente no disponibles.');
      const media = json.data?.Media;
      const isPublic = media && Number(media.id) === id && !media.isAdult && !media.genres?.some(genre => /^(hentai|adult|nsfw)$/i.test(genre));
      const start = media?.startDate;
      const payload = isPublic ? {
        id, tmdb_id: null, source: 'anilist', title: media.title?.english || media.title?.romaji || `Anime #${id}`,
        title_english: media.title?.english || null, title_japanese: media.title?.native || null,
        description: media.description || null, poster_url: media.coverImage?.extraLarge || media.coverImage?.large || null,
        banner_url: media.bannerImage || null, genres: media.genres || [], status: media.status || null,
        total_episodes: media.episodes ?? null, rating: typeof media.averageScore === 'number' ? media.averageScore / 10 : null,
        release_date: start?.year ? `${start.year}-${String(start.month || 1).padStart(2, '0')}-${String(start.day || 1).padStart(2, '0')}` : null,
        seasons: [],
      } : null;
      await pool.query(`INSERT INTO legacy_anime_metadata (anilist_id, payload, expires_at) VALUES ($1, $2, NOW() + $3::interval)
        ON CONFLICT (anilist_id) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`, [id, payload ? JSON.stringify(payload) : null, payload ? '30 days' : '6 hours']);
      return payload;
    })().finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  };
}
