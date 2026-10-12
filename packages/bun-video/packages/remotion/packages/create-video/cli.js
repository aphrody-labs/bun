const fs = require('node:fs');
const path = require('node:path');

const paths = [path.join(__dirname, 'dist', 'init.js')];

const prefix = '#! /usr/bin/env node\n';

paths.forEach((p) => {
	const contents = await Bun.file(p).text();

	if (!contents.startsWith(prefix)) {
		await Bun.write(p, prefix + contents);
	}
});
