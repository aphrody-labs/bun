import {describe, it} from 'bun:test';

// @ts-expect-error
global.describe = describe;
// @ts-expect-error
global.it = it;
