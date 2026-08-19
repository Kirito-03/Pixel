const fs = require('fs'); const html = fs.readFileSync('horario.html', 'utf8'); const matches = [...html.matchAll(/href=\"\\/media\\/([^/\"]+)/g)]; console.log(matches.map(m => m[1]).slice(0,20));
