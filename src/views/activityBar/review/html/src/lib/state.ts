import { ChangeState, ReviewWebviewState } from '../../../state';
import { messageUpdateCounter } from './messageHandler';
import * as React from 'react';
import { getAPI } from './api';

export function getState(): ReviewWebviewState {
	return getAPI().getState();
}

export function useGerritState(): ReviewWebviewState {
	return React.useMemo(() => getState(), [messageUpdateCounter]);
}

export function useCurrentChangeState(): ChangeState | null {
	return React.useMemo(() => {
		const state = getState();
		if (!state.changes || !state.currentChange) {
			return null;
		}
		return state.changes[state.currentChange] ?? null;
	}, [messageUpdateCounter]);
}
