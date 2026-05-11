/**
 * Classification of how a file changed in a
 * patchset, derived from `GerritRevisionFileStatus`
 * but modelled as a discriminated union so each
 * variant can carry its own data and call sites
 * can `switch` exhaustively.
 *
 * Why this exists:
 *   - `GerritFile.status` uses `null` to mean
 *     "modified" (Gerrit omits the status field
 *     for plain modifications). That convention
 *     is implicit and easy to misread.
 *   - The renamed variant carries `oldPath` as a
 *     `string | null` on `GerritFile`, requiring
 *     non-null assertions at every consumer.
 *
 * Encoding the rename's `oldPath` directly on the
 * `'renamed'` variant removes the assertions and
 * makes the data dependency explicit.
 */

import { GerritRevisionFileStatus } from './types';

export type FileChangeKind =
	| { kind: 'added' }
	| { kind: 'deleted' }
	| { kind: 'modified' }
	| { kind: 'renamed'; oldPath: string };

/**
 * Minimal projection of `GerritFile` that the
 * classifier reads. Decoupled from the class so
 * the classifier (and its tests) avoid importing
 * VSCode-coupled modules.
 */
export interface FileStatusInput {
	status: GerritRevisionFileStatus | null;
	oldPath: string | null;
}

/**
 * Map a `GerritFile`'s raw status (and `oldPath`)
 * to a `FileChangeKind`.
 *
 * `null`/missing status is treated as `'modified'`
 * to match Gerrit's API convention.
 */
export function classifyFile(
	file: FileStatusInput
): FileChangeKind {
	switch (file.status) {
		case GerritRevisionFileStatus.ADDED:
			return { kind: 'added' };
		case GerritRevisionFileStatus.DELETED:
			return { kind: 'deleted' };
		case GerritRevisionFileStatus.RENAMED:
			// `GerritRevisionFile`'s type union
			// guarantees `old_path: string` when
			// status === RENAMED, but `GerritFile`
			// stores it as `string | null`. Fall
			// back to an empty string only
			// defensively; in practice this branch
			// is unreachable.
			return {
				kind: 'renamed',
				oldPath: file.oldPath ?? '',
			};
		default:
			return { kind: 'modified' };
	}
}
