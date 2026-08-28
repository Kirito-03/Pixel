import scraper from './server/services/hentailaScraper.js';

(async () => {
  const html = await fetch('https://hentaila.com/media/onaji-semi-no-someya-san-ga-sexy-joyuu-datta-hanashi/1').then(r=>r.text());
  const match = html.match(/\{type:"data",data:(\{media:\{.*?\}\}),uses:/);
  if(match) {
      const dataObj = eval('(' + match[1].replace(/void 0/g, 'null') + ')');
      console.log('Media:', JSON.stringify(Object.keys(dataObj.media), null, 2));
      console.log('Media id:', dataObj.media.id);
      console.log('Poster:', dataObj.media.poster);
      console.log('Cover:', dataObj.media.cover);
      console.log('Image:', dataObj.media.image);
  }
})();
