const __bunSyncFs = require('node:fs');
const fs = require('node:fs');
const path = require('node:path');

const paths = [path.join(__dirname, 'dist', 'init.js')];

const prefix = '#! /usr/bin/env node\n';

paths.forEach((p) => {
	const contents = __bunSyncFs.readFileSync(p, 'utf8');

	if (!contents.startsWith(prefix)) {
		__bunSyncFs.writeFileSync(p, prefix + contents);
	}
});
