import {Composition} from 'remotion';
import {Main} from './components/Main';
import {
	DURATION_IN_FRAMES,
	COMPOSITION_FPS,
	COMPOSITION_HEIGHT,
	COMPOSITION_ID,
	COMPOSITION_WIDTH,
} from './constants.mjs';

export const RemotionRoot = () => {
	return (
		<>
			<Composition
				id={COMPOSITION_ID}
				component={Main}
				durationInFrames={DURATION_IN_FRAMES}
				fps={COMPOSITION_FPS}
				width={COMPOSITION_WIDTH}
				height={COMPOSITION_HEIGHT}
				defaultProps={{title: 'stranger'}}
			/>
		</>
	);
};
