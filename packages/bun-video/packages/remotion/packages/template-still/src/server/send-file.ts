import {Readable} from 'node:stream';
import {Response} from 'express';

export const sendFile = async (
	res: Response,
	data: Readable,
): Promise<void> => {
	return new Promise<void>((resolve, reject) => {
		data
			.pipe(res)
			.on('close', () => {
				res.end();
				resolve();
			})
			.on('error', (err) => {
				reject(err);
			});
	});
};
