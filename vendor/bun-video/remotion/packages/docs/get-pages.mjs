import fs from 'node:fs';
import path from 'node:path';

export const readDir = (dir, pages = []) => {
	const docs = fs.readdirSync(dir);
	for (const doc of docs) {
		const stat = fs.statSync(path.join(dir, doc));
		if (stat.isDirectory()) {
			readDir(path.join(dir, doc), pages);
		} else if (stat.isFile()) {
			if (doc.includes('redirect')) {
				continue;
			}

			pages.push(path.join(dir, doc));
		}
	}

	return pages.sort((a, b) => a.localeCompare(b));
};
