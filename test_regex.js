const fs = require('fs');
const html = fs.readFileSync('hentaila_vid.html', 'utf8');

// Looking for {type:"data",data:{media:{id:..., synopsis: ...}}}
const match = html.match(/\{type:"data",data:(\{media:\{.*?\}\}),uses:/);
if (match) {
  // Try to use eval because the JSON is actually a JS object dump, not strict JSON.
  // We can wrap it to evaluate as a JS object.
  try {
    const dataObj = eval('(' + match[1].replace(/void 0/g, 'null') + ')');
    console.log(dataObj.media.title);
    console.log("Synopsis:", dataObj.media.synopsis?.substring(0, 50));
    console.log("Episodes:", dataObj.media.episodes?.length);
    console.log("Genres:", dataObj.media.genres?.map(g => g.name).join(', '));
  } catch (e) {
    console.error("Eval error", e);
  }
} else {
  console.log("No match");
}
