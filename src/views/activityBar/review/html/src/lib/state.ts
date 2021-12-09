import { ChangeState, ReviewWebviewState } from '../../../state';
import { messageListeners } from './messageHandler';
import * as React from 'react';
import { getAPI } from './api';

export function getState(): ReviewWebviewState {
	return getAPI().getState();
}

export function useGerritState(): ReviewWebviewState {
	const [updateCounter, updateState] = React.useState<number>(0);
	const forceUpdate = React.useCallback(() => updateState((s) => s + 1), []);

	React.useEffect(() => {
		messageListeners.add(forceUpdate);
		return () => {
			messageListeners.delete(forceUpdate);
		};
	}, [forceUpdate]);

	// eslint-disable-next-line react-hooks/exhaustive-deps
	return React.useMemo(() => getState(), [updateCounter]);
}

export function useCurrentChangeState(): ChangeState | null {
	const state = useGerritState();
	return state.overriddenChange ?? state.currentChange ?? null;
}
