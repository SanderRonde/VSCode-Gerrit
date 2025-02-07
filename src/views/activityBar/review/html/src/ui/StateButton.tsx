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
	const [isHovered, setIsHovered] = React.useState(false);

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
				return <ProgressRing />;
			case StateButtonState.SUCCESS:
				return <span className="codicon codicon-check"></span>;
			case StateButtonState.FAILURE:
				return (
					<>
						<div style={styles.paddingRight}>Failed</div>
						<span className="codicon codicon-error"></span>
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

	const style = React.useMemo(() => {
		if (isHovered) {
			return {
				...styles.vscodeButton,
				...styles.buttonHover,
			};
		}
		return styles.vscodeButton;
	}, [isHovered]);
	return (
		<button
			disabled={state === StateButtonState.LOADING ? true : undefined}
			title={props.title}
			onClick={onClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={style}
		>
			{getContent()}
		</button>
	);
};

const styles = createStyles({
	vscodeButton: {
		outline: 'none',
		fontFamily: '"Segoe WPC", "Segoe UI", sans-serif',
		fontWeight: 'normal',
		fontSize: 'var(--type-ramp-base-font-size)',
		lineHeight: 'var(--type-ramp-base-line-height)',
		color: '#cccccc',
		background: '#0078d4',
		borderRadius: '2px',
		fill: 'currentColor',
		cursor: 'pointer',
		border: '1px solid rgba(255, 255, 255, 0.07)',
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'center',
		padding: '10px 10px',
	},
	buttonHover: {
		background: '#026ec1',
	},
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
