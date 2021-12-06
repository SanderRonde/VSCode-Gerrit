import * as React from 'react';

export function createStyle<S extends Record<string, React.CSSProperties>>(
	style: S
): {
	[K in keyof S]: React.CSSProperties;
} {
	return style;
}

export function useJoinedStyles(
	...styles: React.CSSProperties[]
): React.CSSProperties {
	return React.useMemo(() => Object.assign({}, ...styles), styles);
}
