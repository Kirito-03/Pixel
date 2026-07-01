const fs = require('fs');
const file = 'server/services/animeImportService.js';
let code = fs.readFileSync(file, 'utf8');
code = code.replace("videoUrl ? 'queued' : 'missing'", "videoUrl ? (options.transcode ? 'queued' : 'ready') : 'missing'");
fs.writeFileSync(file, code);
