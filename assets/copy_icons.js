const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, 'icon.png');
const targets = ['favicon.png', 'splash-icon.png', 'adaptive-icon.png'];

try {
    if (fs.existsSync(source)) {
        targets.forEach(target => {
            fs.copyFileSync(source, path.resolve(__dirname, target));
            console.log(`Copied icon.png to ${target}`);
        });
        console.log('Copy complete.');
    } else {
        console.error('icon.png not found!');
    }
} catch (err) {
    console.error('Error copying files:', err);
}
