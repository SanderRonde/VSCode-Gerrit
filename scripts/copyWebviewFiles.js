// eslint-disable-next-line node/no-unpublished-require
const fs = require('fs-extra');
const path = require('path');

void (async () => {
	await fs.mkdirp(
		path.join(__dirname, '../out/views/activityBar/review/html/dist')
	);
	await fs.mkdirp(
		path.join(__dirname, '../out/views/activityBar/review/css')
	);
	await fs.copyFile(
		path.join(
			__dirname,
			'../src/views/activityBar/review/html/dist/index.js'
		),
		path.join(
			__dirname,
			'../out/views/activityBar/review/html/dist/index.js'
		)
	);
	await fs.copyFile(
		path.join(__dirname, '../src/views/activityBar/review/css/index.css'),
		path.join(__dirname, '../out/views/activityBar/review/css/index.css')
	);
})();
