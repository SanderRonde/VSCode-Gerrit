import { createStyles } from '../lib/style';
// For types
import * as React from 'react';
import '../lib/components';

export enum StateButtonState {
	DEFAULT,
	LOADING,
	SUCCESS,
	FAILURE,
}

const DISPLAY_TIME = 2000;

const ProgressRing: React.VFC = () => {
	return (
		<svg viewBox="0 0 16 16" style={styles.progress}>
			<circle
				cx="8px"
				cy="8px"
				r="7px"
				style={styles.background}
			></circle>
			<circle cx="8px" cy="8px" r="7px" style={styles.indicator}></circle>
		</svg>
	);
};

export interface StateButtonProps {
	title: string;
	onSubmit: () => void;
	onStateUpdate: (newState: StateButtonState) => void;
	currentState: StateButtonState;
}

export const StateButton: React.FC<StateButtonProps> = (props) => {
	const [state, setState] = React.useState<StateButtonState>(
		props.currentState
	);

	const onClick = React.useCallback(() => {
		if (state === StateButtonState.LOADING) {
			return;
		}

		setState(StateButtonState.LOADING);
		props.onSubmit();
	}, [props, state]);

	const getContent = React.useCallback(() => {
		switch (state) {
			case StateButtonState.DEFAULT:
				return props.children;
			case StateButtonState.LOADING:
				return (
					<span slot="end">
						<ProgressRing />
					</span>
				);
			case StateButtonState.SUCCESS:
				return (
					<span slot="end" className="codicon codicon-check"></span>
				);
			case StateButtonState.FAILURE:
				return (
					<>
						<div style={styles.paddingRight}>Failed</div>
						<span
							slot="end"
							className="codicon codicon-error"
						></span>
					</>
				);
		}
	}, [props.children, state]);

	const currentState = props.currentState;
	const { onStateUpdate } = props;
	React.useEffect(() => {
		if (currentState !== StateButtonState.DEFAULT) {
			setState(currentState);
			setTimeout(() => {
				setState(StateButtonState.DEFAULT);
				onStateUpdate(StateButtonState.DEFAULT);
			}, DISPLAY_TIME);
		}
	}, [currentState, onStateUpdate]);

	return (
		<vscode-button
			disabled={state === StateButtonState.LOADING ? true : undefined}
			title={props.title}
			onClick={onClick}
		>
			{getContent()}
		</vscode-button>
	);
};

const styles = createStyles({
	progress: {
		width: '20px',
		height: '20px',
	},
	background: {
		fill: 'none',
		stroke: 'transparent',
		strokeWidth: '2px',
	},
	indicator: {
		fill: 'none',
		stroke: 'var(--vscode-input-foreground)',
		strokeWidth: '2px',
		strokeLinecap: 'square',
		transformOrigin: '50% 50%',
		transform: 'rotate(-90deg)',
		transition: 'all 0.2s ease-in-out 0s',
		animation: '2s linear 0s infinite normal none running spin-infinite',
	},
	paddingRight: {
		paddingRight: '10px',
	},
});
