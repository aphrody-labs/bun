import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const localPackageRootKey = '_remotionInternalPackageRoot';

export const getLocalPackageOverride = ({
	remotionRoot,
	packageName,
}: {
	remotionRoot: string;
	packageName: string;
}): string | null => {
	const packageJsonPath = path.join(remotionRoot, 'package.json');
	if (!await Bun.file(packageJsonPath).exists()) {
		return null;
	}

	const packageJson = await Bun.file(packageJsonPath).json();
	const localPackageRoot = packageJson[localPackageRootKey];
	if (typeof localPackageRoot !== 'string') {
		return null;
	}

	const packagesRoot = path.join(localPackageRoot, 'packages');
	if (!await Bun.file(packagesRoot).exists()) {
		return null;
	}

	for (const directory of fs.readdirSync(packagesRoot)) {
		const packageDirectory = path.join(packagesRoot, directory);
		const candidatePackageJsonPath = path.join(
			packageDirectory,
			'package.json',
		);
		if (!await Bun.file(candidatePackageJsonPath).exists()) {
			continue;
		}

		const candidatePackageJson = JSON.parse(
			await Bun.file(candidatePackageJsonPath).text(),
		);
		if (
			candidatePackageJson.name === packageName &&
			!candidatePackageJson.private
		) {
			return pathToFileURL(packageDirectory).href;
		}
	}

	return null;
};
