import scraper from './server/services/hentailaScraper.js';

(async () => {
  const animes = await scraper.getLatestHentai();
  let matches = 0;
  for(let i=0; i<Math.min(5, animes.length); i++) {
    const html = await fetch('https://hentaila.com/media/'+animes[i].slug+'/1').then(r=>r.text());
    const match = html.match(/\{type:"data",data:(\{media:\{.*?\}\}),uses:/);
    if(match) {
        matches++;
        console.log('Match for', animes[i].slug);
    } else {
        console.log('No match for', animes[i].slug);
    }
  }
  console.log('Matches:', matches, '/ 5');
})();
