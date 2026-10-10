import {Config} from '@remotion/cli/config';

Config.setConcurrency(require('node:os').cpus().length);
Config.Output.setOverwriteOutput(true);
