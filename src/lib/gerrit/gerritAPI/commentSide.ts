import { GerritCommentSide } from './types';

export function commentMatchesFileSide(
	commentSide: GerritCommentSide | undefined,
	fileSide: GerritCommentSide | 'BOTH'
): boolean {
	if (fileSide === 'BOTH') {
		return true;
	}
	return (commentSide ?? GerritCommentSide.RIGHT) === fileSide;
}
