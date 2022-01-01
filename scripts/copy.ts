import * as fs from 'fs-extra';

function copy(source: string, destination: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		fs.copy(source, destination, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

(async () => {
	if (process.argv.length < 4) {
		console.error('Please specify the source and destination directories.');
		process.exit(1);
	}

	copy(process.argv[2], process.argv[3]);
})();
