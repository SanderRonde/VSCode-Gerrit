import * as assert from 'assert';
import { GerritRevisionFileStatus } from '../src/lib/gerrit/gerritAPI/types';
import { classifyFile } from '../src/lib/gerrit/gerritAPI/fileChangeKind';

describe('classifyFile', () => {
	it('returns added for ADDED status', () => {
		const result = classifyFile({
			status: GerritRevisionFileStatus.ADDED,
			oldPath: null,
		});
		assert.deepStrictEqual(result, { kind: 'added' });
	});

	it('returns deleted for DELETED status', () => {
		const result = classifyFile({
			status: GerritRevisionFileStatus.DELETED,
			oldPath: null,
		});
		assert.deepStrictEqual(result, { kind: 'deleted' });
	});

	it(
		'returns renamed with oldPath for RENAMED status',
		() => {
			const result = classifyFile({
				status: GerritRevisionFileStatus.RENAMED,
				oldPath: 'src/old.ts',
			});
			assert.deepStrictEqual(result, {
				kind: 'renamed',
				oldPath: 'src/old.ts',
			});
		}
	);

	it(
		'falls back to empty oldPath when RENAMED has' +
			' null oldPath (defensive)',
		() => {
			const result = classifyFile({
				status: GerritRevisionFileStatus.RENAMED,
				oldPath: null,
			});
			assert.deepStrictEqual(result, {
				kind: 'renamed',
				oldPath: '',
			});
		}
	);

	it(
		'treats null status as modified (Gerrit API' +
			' convention)',
		() => {
			const result = classifyFile({
				status: null,
				oldPath: null,
			});
			assert.deepStrictEqual(result, {
				kind: 'modified',
			});
		}
	);
});
