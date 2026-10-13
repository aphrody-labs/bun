import type {ChildProcess} from 'node:child_process';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {
	EXPANDED_SIDEBAR_STATE,
	LOGS_FILE,
	ORIGINAL_CONTENT_FILE,
	ORIGINAL_EFFECT_KEYFRAME_E2E_FILE,
	ORIGINAL_ERROR_OVERLAY_E2E_FILE,
	ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE,
	ORIGINAL_LOST_NODE_PATH_E2E_FILE,
	ORIGINAL_VISUAL_CONTROLS_FILE,
	STUDIO_PORT,
	STUDIO_URL,
	e2eEntryPoint,
	effectKeyframeE2eFile,
	errorOverlayE2eFile,
	exampleDir,
	hookOrderChangeE2eFile,
	lostNodePathE2eFile,
	remotionBin,
	rootFile,
	visualControlsFile,
} from './constants.mts';

let studioProcess: ChildProcess | null = null;

async function waitForServer(
	url: string,
	timeoutMs: number = 60_000,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok) {
				return;
			}
		} catch {
			// Server not ready yet
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

export async function startStudio(): Promise<void> {
	// Save original files if not already saved
	if (!(await Bun.file(ORIGINAL_CONTENT_FILE).exists())) {
		await Bun.write(ORIGINAL_CONTENT_FILE, fs.readFileSync(rootFile, 'utf-8'));
	}

	if (!(await Bun.file(ORIGINAL_VISUAL_CONTROLS_FILE).exists())) {
		await Bun.write(
			ORIGINAL_VISUAL_CONTROLS_FILE,
			fs.readFileSync(visualControlsFile, 'utf-8'),
		);
	}

	if (!(await Bun.file(ORIGINAL_EFFECT_KEYFRAME_E2E_FILE).exists())) {
		await Bun.write(
			ORIGINAL_EFFECT_KEYFRAME_E2E_FILE,
			fs.readFileSync(effectKeyframeE2eFile, 'utf-8'),
		);
	}

	if (!(await Bun.file(ORIGINAL_LOST_NODE_PATH_E2E_FILE).exists())) {
		await Bun.write(
			ORIGINAL_LOST_NODE_PATH_E2E_FILE,
			fs.readFileSync(lostNodePathE2eFile, 'utf-8'),
		);
	}

	if (!(await Bun.file(ORIGINAL_ERROR_OVERLAY_E2E_FILE).exists())) {
		await Bun.write(
			ORIGINAL_ERROR_OVERLAY_E2E_FILE,
			fs.readFileSync(errorOverlayE2eFile, 'utf-8'),
		);
	}

	if (!(await Bun.file(ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE).exists())) {
		await Bun.write(
			ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE,
			fs.readFileSync(hookOrderChangeE2eFile, 'utf-8'),
		);
	}

	// Restore original files before starting
	await Bun.write(rootFile, fs.readFileSync(ORIGINAL_CONTENT_FILE, 'utf-8'));
	await Bun.write(
		visualControlsFile,
		fs.readFileSync(ORIGINAL_VISUAL_CONTROLS_FILE, 'utf-8'),
	);
	await Bun.write(
		effectKeyframeE2eFile,
		fs.readFileSync(ORIGINAL_EFFECT_KEYFRAME_E2E_FILE, 'utf-8'),
	);
	await Bun.write(
		lostNodePathE2eFile,
		fs.readFileSync(ORIGINAL_LOST_NODE_PATH_E2E_FILE, 'utf-8'),
	);
	await Bun.write(
		errorOverlayE2eFile,
		fs.readFileSync(ORIGINAL_ERROR_OVERLAY_E2E_FILE, 'utf-8'),
	);
	await Bun.write(
		hookOrderChangeE2eFile,
		fs.readFileSync(ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE, 'utf-8'),
	);

	await Bun.write(LOGS_FILE, '');
	await Bun.write(
		EXPANDED_SIDEBAR_STATE,
		JSON.stringify({
			cookies: [],
			origins: [
				{
					origin: STUDIO_URL,
					localStorage: [
						{
							name: 'remotion.sidebarRightCollapsing.v2',
							value: 'expanded',
						},
					],
				},
			],
		}),
	);

	studioProcess = spawn(
		remotionBin,
		[
			'studio',
			e2eEntryPoint,
			'--port',
			String(STUDIO_PORT),
			'--props',
			'src/my-props.json',
			'--log=trace',
		],
		{
			cwd: exampleDir,
			stdio: 'pipe',
			env: {
				...process.env,
				BROWSER: 'none',
			},
		},
	);

	let buildResolve: (() => void) | null = null;
	const buildPromise = new Promise<void>((resolve) => {
		buildResolve = resolve;
	});

	studioProcess.stderr?.on('data', (data: Buffer) => {
		const msg = data.toString();
		if (!msg.includes('ExperimentalWarning')) {
			process.stderr.write(`[studio stderr] ${msg.trim()}\n`);
		}
	});

	studioProcess.stdout?.on('data', (data: Buffer) => {
		const msg = data.toString();
		fs.appendFileSync(LOGS_FILE, JSON.stringify(msg) + '\n');
		process.stdout.write(`[studio stdout] ${msg.trim()}\n`);
		if (msg.includes('Built in') && buildResolve) {
			buildResolve();
			buildResolve = null;
		}
	});

	await waitForServer(STUDIO_URL);
	await buildPromise;

	// Wait until no new "Building..." appears for 3 seconds,
	// meaning all builds (including secondary ones) have settled.
	let lastBuildTime = Date.now();
	const onData = (data: Buffer) => {
		const msg = data.toString();
		if (msg.includes('Building...') || msg.includes('Built in')) {
			lastBuildTime = Date.now();
		}
	};

	studioProcess.stdout?.on('data', onData);
	await new Promise<void>((resolve) => {
		const check = () => {
			if (Date.now() - lastBuildTime >= 3_000) {
				studioProcess?.stdout?.removeListener('data', onData);
				resolve();
			} else {
				setTimeout(check, 500);
			}
		};

		setTimeout(check, 500);
	});
}

export async function stopStudio(): Promise<void> {
	if (studioProcess?.pid) {
		try {
			process.kill(studioProcess.pid, 'SIGTERM');
		} catch {
			// Process might already be dead
		}

		// Wait for process to exit
		await new Promise<void>((resolve) => {
			if (!studioProcess) {
				resolve();
				return;
			}

			studioProcess.on('exit', () => resolve());
			setTimeout(resolve, 5_000);
		});
	}

	studioProcess = null;

	// Restore original files
	if (await Bun.file(ORIGINAL_CONTENT_FILE).exists()) {
		await Bun.write(rootFile, fs.readFileSync(ORIGINAL_CONTENT_FILE, 'utf-8'));
	}

	if (await Bun.file(ORIGINAL_VISUAL_CONTROLS_FILE).exists()) {
		await Bun.write(
			visualControlsFile,
			fs.readFileSync(ORIGINAL_VISUAL_CONTROLS_FILE, 'utf-8'),
		);
	}

	if (await Bun.file(ORIGINAL_EFFECT_KEYFRAME_E2E_FILE).exists()) {
		await Bun.write(
			effectKeyframeE2eFile,
			fs.readFileSync(ORIGINAL_EFFECT_KEYFRAME_E2E_FILE, 'utf-8'),
		);
	}

	if (await Bun.file(ORIGINAL_LOST_NODE_PATH_E2E_FILE).exists()) {
		await Bun.write(
			lostNodePathE2eFile,
			fs.readFileSync(ORIGINAL_LOST_NODE_PATH_E2E_FILE, 'utf-8'),
		);
	}

	if (await Bun.file(ORIGINAL_ERROR_OVERLAY_E2E_FILE).exists()) {
		await Bun.write(
			errorOverlayE2eFile,
			fs.readFileSync(ORIGINAL_ERROR_OVERLAY_E2E_FILE, 'utf-8'),
		);
	}

	if (await Bun.file(ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE).exists()) {
		await Bun.write(
			hookOrderChangeE2eFile,
			fs.readFileSync(ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE, 'utf-8'),
		);
	}
}
