import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import path from 'node:path';

test('Docs should refer to right bun version', () => {
	const root = path.join(__dirname, '..', '..', '..', '..');

	const version = JSON.parse(
		readFileSync(path.join(root, 'package.json'), 'utf-8'),
	).packageManager.split('@')[1];

	expect(
		readFileSync(
			path.join(root, 'packages/docs/docs/contributing/index.mdx'),
			'utf-8',
		),
	).toContain(version);
});
