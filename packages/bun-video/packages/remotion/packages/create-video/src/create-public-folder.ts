import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

export const createPublicFolder = (projectRoot: string) => {
	const target = join(projectRoot, 'public');
	if (existsSync(target)) {
		return;
	}

	mkdirSync(target);
};
