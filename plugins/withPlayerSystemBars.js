const fs = require('node:fs');
const path = require('node:path');
const { withMainApplication, withDangerousMod, withGradleProperties } = require('expo/config-plugins');

module.exports = function withPlayerSystemBars(config) {
  config = withGradleProperties(config, next => {
    const limits = {
      'org.gradle.parallel': 'false',
      'org.gradle.workers.max': '1',
      'org.gradle.daemon': 'false',
      'kotlin.compiler.execution.strategy': 'in-process',
    };
    for (const [key, value] of Object.entries(limits)) {
      next.modResults = next.modResults.filter(item => item.type !== 'property' || item.key !== key);
      next.modResults.push({ type: 'property', key, value });
    }
    return next;
  });
  config = withMainApplication(config, next => {
    const marker = 'add(PlayerSystemBarsPackage())';
    if (!next.modResults.contents.includes(marker)) {
      const anchor = 'PackageList(this).packages.apply {';
      if (!next.modResults.contents.includes(anchor)) throw new Error('No se pudo registrar PlayerSystemBarsPackage.');
      next.modResults.contents = next.modResults.contents.replace(anchor, `${anchor}\n              ${marker}`);
    }
    return next;
  });
  return withDangerousMod(config, ['android', async next => {
    const destination = path.join(next.modRequest.platformProjectRoot, 'app/src/main/java/com/dragonflux/pixelnosekai');
    fs.mkdirSync(destination, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'android/PlayerSystemBarsPackage.kt'), path.join(destination, 'PlayerSystemBarsPackage.kt'));
    return next;
  }]);
};
