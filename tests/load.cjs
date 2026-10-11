// Loads the app's Node-safe files (src/core/ minus the browser-only parts, and every type) the same way
// tools/build-data.cjs does, and returns the shared Quizy namespace.
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'src');
for (const file of ['random.js', 'util.js', 'scoring.js', 'data.js']) require(path.join(src, 'core', file));
require(path.join(src, 'types', 'registry.js'));
for (const file of fs.readdirSync(path.join(src, 'types')).sort()) require(path.join(src, 'types', file));
module.exports = globalThis.Quizy;
