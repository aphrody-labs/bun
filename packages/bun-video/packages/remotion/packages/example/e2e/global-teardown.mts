import fs from 'node:fs';
import {
	ORIGINAL_CONTENT_FILE,
	ORIGINAL_EFFECT_KEYFRAME_E2E_FILE,
	ORIGINAL_ERROR_OVERLAY_E2E_FILE,
	ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE,
	ORIGINAL_LOST_NODE_PATH_E2E_FILE,
	ORIGINAL_VISUAL_CONTROLS_FILE,
	effectKeyframeE2eFile,
	errorOverlayE2eFile,
	hookOrderChangeE2eFile,
	lostNodePathE2eFile,
	rootFile,
	visualControlsFile,
} from './constants.mts';

export default async function globalTeardown(): Promise<void> {
	if (await Bun.file(ORIGINAL_CONTENT_FILE).exists()) {
		await Bun.write(rootFile, fs.readFileSync(ORIGINAL_CONTENT_FILE, 'utf-8'));
		fs.unlinkSync(ORIGINAL_CONTENT_FILE);
	}

	if (await Bun.file(ORIGINAL_VISUAL_CONTROLS_FILE).exists()) {
		await Bun.write(visualControlsFile, fs.readFileSync(ORIGINAL_VISUAL_CONTROLS_FILE, 'utf-8'),
		);
		fs.unlinkSync(ORIGINAL_VISUAL_CONTROLS_FILE);
	}

	if (await Bun.file(ORIGINAL_EFFECT_KEYFRAME_E2E_FILE).exists()) {
		await Bun.write(effectKeyframeE2eFile, fs.readFileSync(ORIGINAL_EFFECT_KEYFRAME_E2E_FILE, 'utf-8'),
		);
		fs.unlinkSync(ORIGINAL_EFFECT_KEYFRAME_E2E_FILE);
	}

	if (await Bun.file(ORIGINAL_LOST_NODE_PATH_E2E_FILE).exists()) {
		await Bun.write(lostNodePathE2eFile, fs.readFileSync(ORIGINAL_LOST_NODE_PATH_E2E_FILE, 'utf-8'),
		);
		fs.unlinkSync(ORIGINAL_LOST_NODE_PATH_E2E_FILE);
	}

	if (await Bun.file(ORIGINAL_ERROR_OVERLAY_E2E_FILE).exists()) {
		await Bun.write(errorOverlayE2eFile, fs.readFileSync(ORIGINAL_ERROR_OVERLAY_E2E_FILE, 'utf-8'),
		);
		fs.unlinkSync(ORIGINAL_ERROR_OVERLAY_E2E_FILE);
	}

	if (await Bun.file(ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE).exists()) {
		await Bun.write(hookOrderChangeE2eFile, fs.readFileSync(ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE, 'utf-8'),
		);
		fs.unlinkSync(ORIGINAL_HOOK_ORDER_CHANGE_E2E_FILE);
	}
}
