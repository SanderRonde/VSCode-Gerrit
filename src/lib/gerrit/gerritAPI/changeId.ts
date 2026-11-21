/**
 * Gerrit identifies a change as `project~branch~I{40-hex}` in API
 * payloads, while git commit footers and some callers only have `I{40-hex}`.
 */
export function normalizeChangeID(id: string): string {
	const parts = id.split('~');
	return parts[parts.length - 1] ?? id;
}

export function changeIdFromCheckoutString(changeID: string | number): string {
	if (typeof changeID === 'number') {
		return String(changeID);
	}
	return normalizeChangeID(changeID);
}

export function changeIdsEqual(
	a: string | null | undefined,
	b: string | null | undefined
): boolean {
	if (!a || !b) {
		return false;
	}
	if (a.includes('~') && b.includes('~')) {
		// Both fully qualified. Cherry-picks to other branches share the
		// I{hex} part but are different changes.
		return a === b;
	}
	return normalizeChangeID(a) === normalizeChangeID(b);
}
