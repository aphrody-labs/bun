import fs from 'node:fs';
import path from 'node:path';

export const addTailwindRootCss = (projectRoot: string) => {
	const rootFileTsx = path.join(projectRoot, 'src', 'Root.tsx');
	const rootFileJsx = path.join(projectRoot, 'src', 'Root.jsx');
	const indexCss = path.join(projectRoot, 'src', 'index.css');

	const rootFile = await Bun.file(rootFileTsx).exists() ? rootFileTsx : rootFileJsx;

	if (!await Bun.file(rootFile).exists()) {
		throw new Error('No Root file found');
	}

	const root = await Bun.file(rootFile).text();

	const newFile = `import "./index.css";\n${root}`;
	await Bun.write(rootFile, newFile);

	const css = `@import "tailwindcss";\n`;
	await Bun.write(indexCss, css);
};

export const addTailwindToConfig = (projectRoot: string) => {
	const configFileTs = path.join(projectRoot, 'remotion.config.ts');
	const configFileJs = path.join(projectRoot, 'remotion.config.js');

	const configFile = await Bun.file(configFileTs).exists() ? configFileTs : configFileJs;

	if (!await Bun.file(configFile).exists()) {
		throw new Error('No remotion.config.ts file found');
	}

	const config = await Bun.file(configFile).text();
	const lines = config.trim().split('\n');
	let lineNo = 0;
	let lastImportLine = 0;
	for (const line of lines) {
		if (line.startsWith('import ')) {
			lastImportLine = lineNo;
		}

		lineNo++;
	}

	const headerLines = lines.slice(0, lastImportLine + 1);
	const tailLines = lines.slice(lastImportLine + 1);

	const newLines = [
		...headerLines,
		`import { enableTailwind } from '@remotion/tailwind-v4';`,
		...tailLines,
		'Config.overrideBundlerConfig(enableTailwind);',
	];

	await Bun.write(configFile, newLines.join('\n') + '\n');
};
