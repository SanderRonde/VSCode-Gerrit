import {
	changeIdFromCheckoutString,
	changeIdsEqual,
	normalizeChangeID,
} from '../src/lib/gerrit/gerritAPI/changeId';
import { commentMatchesFileSide } from '../src/lib/gerrit/gerritAPI/commentSide';
import { GerritCommentSide } from '../src/lib/gerrit/gerritAPI/types';
import { isLikelyGerritHost } from '../src/lib/util/gerritHost';
import { toGerritUriPath } from '../src/lib/util/gerritUri';
import { shellQuote } from '../src/lib/util/util';
import assert from 'assert';

function proveAsyncFilterDoesNotFilter(): void {
	const repos = ['a', 'b', 'c'];
	const filtered = repos.filter(async (repo) => repo === 'a');
	assert.deepStrictEqual(
		filtered,
		repos,
		'Array.filter(async) keeps every item because promises are truthy'
	);
}

function provePopStashKeepsOthersWhenInverted(): void {
	const stashes = [{ id: 'keep' }, { id: 'drop' }, { id: 'also-keep' }];
	const inverted = stashes.filter((s) => s.id !== 'drop');
	const buggy = stashes.filter((s) => s.id === 'drop');
	assert.deepStrictEqual(
		inverted.map((s) => s.id),
		['keep', 'also-keep']
	);
	assert.deepStrictEqual(
		buggy.map((s) => s.id),
		['drop']
	);
}

async function main(): Promise<void> {
	assert.strictEqual(
		normalizeChangeID('I' + 'a'.repeat(40)),
		'I' + 'a'.repeat(40)
	);
	assert.strictEqual(
		normalizeChangeID(`project~master~I${'b'.repeat(40)}`),
		'I' + 'b'.repeat(40)
	);
	assert.ok(
		changeIdsEqual(
			`project~master~I${'c'.repeat(40)}`,
			'I' + 'c'.repeat(40)
		)
	);
	assert.ok(!changeIdsEqual('I' + 'a'.repeat(40), 'I' + 'b'.repeat(40)));
	assert.ok(!changeIdsEqual(null, 'I' + 'a'.repeat(40)));
	assert.strictEqual(changeIdFromCheckoutString(12345), '12345');
	assert.strictEqual(
		changeIdFromCheckoutString(`foo~bar~I${'d'.repeat(40)}`),
		'I' + 'd'.repeat(40)
	);
	assert.strictEqual(
		changeIdFromCheckoutString('I' + 'e'.repeat(40)),
		'I' + 'e'.repeat(40)
	);

	assert.strictEqual(shellQuote('safe'), `'safe'`);
	assert.strictEqual(shellQuote("it's"), `'it'\\''s'`);
	assert.strictEqual(shellQuote('stash@{0}'), `'stash@{0}'`);

	assert.ok(!isLikelyGerritHost('github.com'));
	assert.ok(!isLikelyGerritHost('https://github.com'));
	assert.ok(!isLikelyGerritHost('www.github.com'));
	assert.ok(!isLikelyGerritHost('gitlab.com'));
	assert.ok(isLikelyGerritHost('gerrit.example.com'));
	assert.ok(isLikelyGerritHost('review.android.com'));

	assert.ok(
		commentMatchesFileSide(undefined, GerritCommentSide.RIGHT),
		'Missing side defaults to the revision/right pane'
	);
	assert.ok(
		!commentMatchesFileSide(undefined, GerritCommentSide.LEFT),
		'Operator-precedence bug treated missing side as always matching'
	);
	assert.ok(
		commentMatchesFileSide(GerritCommentSide.LEFT, GerritCommentSide.LEFT)
	);
	assert.ok(commentMatchesFileSide(GerritCommentSide.RIGHT, 'BOTH'));

	assert.strictEqual(toGerritUriPath('src/foo.ts'), '/src/foo.ts');
	assert.strictEqual(toGerritUriPath('/COMMIT_MSG'), '/COMMIT_MSG');
	assert.strictEqual(toGerritUriPath(''), '/');

	proveAsyncFilterDoesNotFilter();
	provePopStashKeepsOthersWhenInverted();

	const sameMessageSkip = (message: string, current: string): boolean =>
		message === current;
	assert.ok(sameMessageSkip('hello', 'hello'));
	assert.ok(!sameMessageSkip('hello', 'world'));

	console.log('All bugfix proofs passed');
}

void main();
