const cp = require('node:child_process');
const fs = require('node:fs');
const {VERSION} = require('remotion');

const versions = [`remotionlambda-arm64.zip`];

for (const version of versions) {
	cp.execSync(`unzip -o ${version} -d extracted`);
	const contents = await Bun.file('extracted/index.js').text();
	fs.rmSync('extracted', {recursive: true});
	const inConstants = await Bun.file('../core/dist/cjs/version.js').text();
	const [, inPkg] = inConstants.match(/exports\.VERSION = '(.*)'/);

	const inLambda = contents.includes(`="${VERSION}"`);

	if (!inLambda) {
		console.error(
			`Version is not aligned in lambda, and in package ${inPkg}. Align the versions.`,
		);
		process.exit(1);
	}

	console.log(`Lambda version aligns in ${version}`);
}
