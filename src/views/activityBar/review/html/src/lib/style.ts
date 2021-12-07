import * as React from 'react';

export function createStyles<S extends Record<string, React.CSSProperties>>(
	style: S
): {
	[K in keyof S]: React.CSSProperties;
} {
	return style;
}

export function useJoinedStyles(
	...styles: (React.CSSProperties | undefined)[]
): React.CSSProperties {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return React.useMemo(() => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return Object.assign({}, ...styles);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, styles);
}
