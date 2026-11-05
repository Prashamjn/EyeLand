// Loads every *.test.js so `npm test` works on any Node >= 18 and on Windows (no shell globbing needed).
const fs = require('fs'), path = require('path');
for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.test.js')).sort()) require(path.join(__dirname, f));
