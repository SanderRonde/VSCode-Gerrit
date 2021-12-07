import { createStyles, useJoinedStyles } from '../lib/style';
import * as React from 'react';

interface BadgeProps {
	label: string;
	style?: React.CSSProperties;
	title?: string;
	onClick?: () => void;
}

const Badge: React.VFC<BadgeProps> = (props) => {
	const style = useJoinedStyles(styles.badge, props.style ?? undefined);

	return (
		<div title={props.title} onClick={props.onClick} style={style}>
			{props.label}
		</div>
	);
};

interface ScorePickerProps {
	possibleValues: {
		score: string;
		description: string;
	}[];
	name: string;
	onPickValue: (name: string, value: number) => void;
}
export const ScorePicker: React.VFC<ScorePickerProps> = (props) => {
	const [selectedValue, setSelectedValue] = React.useState<number>(0);

	const toNum = React.useCallback(
		(score: string) => parseInt(score.trim(), 10),
		[]
	);

	const getStyle = React.useCallback(
		(score: string): React.CSSProperties => {
			const scoreNum = toNum(score);
			const allValues = props.possibleValues.map((v) => toNum(v.score));

			if (scoreNum === 0) {
				return styles.selectedNeutral;
			}
			if (scoreNum === Math.max(...allValues)) {
				return styles.selectedApproved;
			}
			if (scoreNum === Math.min(...allValues)) {
				return styles.selectedRejected;
			}
			if (scoreNum > 0) {
				return styles.selectedRecommended;
			} else {
				return styles.selectedDisliked;
			}
		},
		[props.possibleValues, toNum]
	);

	const onClick = React.useCallback(
		(index: number) => {
			const score = toNum(props.possibleValues[index].score);
			setSelectedValue(score);
			props.onPickValue(props.name, score);
		},
		[props, toNum]
	);

	return (
		<div style={styles.container}>
			<div style={styles.label}>{`${props.name}:`}</div>
			<div style={styles.scoreContainerContainer}>
				<div style={styles.scoreContainer}>
					{props.possibleValues.map((possibleValue, i) => {
						return (
							<Badge
								key={i}
								title={possibleValue.description}
								style={
									selectedValue === toNum(possibleValue.score)
										? getStyle(possibleValue.score)
										: undefined
								}
								label={possibleValue.score}
								onClick={() => onClick(i)}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
};

const styles = createStyles({
	container: {
		display: 'table-row',
	},
	label: {
		display: 'table-cell',
	},
	selectedRecommended: {
		backgroundColor: '#3f6732',
	},
	selectedApproved: {
		backgroundColor: '#7fb66b',
	},
	selectedNeutral: {
		backgroundColor: '#597280',
	},
	selectedDisliked: {
		backgroundColor: '#bf6874',
	},
	selectedRejected: {
		backgroundColor: '#ac2d3e',
	},
	scoreContainerContainer: {
		display: 'table-cell',
	},
	scoreContainer: {
		marginLeft: '10px',
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'flex-start',
	},
	badge: {
		alignItems: 'center',
		backgroundColor: 'var(--vscode-badge-background)',
		borderRadius: '100px',
		boxSizing: 'border-box',
		color: 'var(--vscode-badge-foreground)',
		display: 'flex',
		height: '16px',
		justifyContent: 'center',
		minWidth: '16px',
		padding: '0 4px',
		margin: '0 1px',
		cursor: 'pointer',
		userSelect: 'none',
		WebkitUserSelect: 'none',
	},
});
