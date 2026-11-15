import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRssArticles, normalizeArticle } from '../server/services/newsService.js';

test('a failed publisher and a malformed item date do not discard healthy RSS news', async () => {
  const results = [];
  const xml = `<rss><channel>
    <item><title><![CDATA[Un anime &amp; su tráiler]]></title><link>https://somoskudasai.com/noticias/uno/</link><pubDate>bad-date</pubDate><description><![CDATA[<p>La nueva temporada del anime se estrena pronto.</p>]]></description></item>
    <item><title>Otro anime</title><link>https://somoskudasai.com/noticias/dos/</link><pubDate>Sat, 14 Nov 2026 12:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const items = await fetchRssArticles({ feeds: ['https://down.test/feed', 'https://good.test/feed', 'https://http.test/feed'],
    fetchImpl: async url => {
      if (url.includes('down')) throw new Error('network unavailable');
      return { ok: !url.includes('http.test'), status: 503, text: async () => xml };
    }, onFeedResult: result => results.push(result) });
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Un anime & su tráiler');
  assert.equal(items[0].publishedAt, null);
  assert.equal(items[1].publishedAt, '2026-11-14T12:00:00.000Z');
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(normalizeArticle(items[0]).category, 'tráiler');
});
test('a successful HTML response without RSS entries reports an unavailable feed', async () => {
  let result;
  const articles = await fetchRssArticles({ feeds: ['https://publisher.test/feed'], fetchImpl: async () => ({ ok: true, text: async () => '<html>Not a feed</html>' }), onFeedResult: value => result = value });
  assert.equal(articles.length, 0); assert.equal(result.ok, false);
});
