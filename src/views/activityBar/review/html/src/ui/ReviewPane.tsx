import { ChangeState, ReviewPerson, ReviewWebviewState } from '../../../state';
import { messageListeners, sendMessage } from '../lib/messageHandler';
import { useCurrentChangeState, useGerritState } from '../lib/state';
import { StateButton, StateButtonState } from './StateButton';
import { createStyles, useJoinedStyles } from '../lib/style';
import { ReviewerPicker } from './pickers/ReviewerPicker';
import { ReviewWebviewMessage } from '../../../messaging';
import { CCPicker } from './pickers/CCPicker';
import { useDebounce } from '../lib/debounce';
import { globalStyles } from '../lib/styles';
import { ScorePicker } from './ScorePicker';
import { fromEntries } from '../lib/util';
import { EmptyView } from './EmptyView';
import { getAPI } from '../lib/api';
import * as React from 'react';

export const ReviewPane: React.VFC = () => {
	const currentState = useCurrentChangeState();

	if (!currentState) {
		return <EmptyView />;
	}

	return <_ReviewPane currentState={currentState} />;
};

interface ReviewPaneProps {
	currentState: ChangeState;
}
const _ReviewPane: React.VFC<ReviewPaneProps> = ({ currentState }) => {
	const [editingState, setEditingState] = React.useState<
		| (ChangeState & {
				resolved: boolean;
				postComments: boolean;
				labelValues: Record<string, number>;
		  })
		| null
	>();
	const [buttonState, setButtonState] = React.useState<StateButtonState>(
		StateButtonState.DEFAULT
	);
	const [reset, setReset] = React.useState<boolean>(false);

	const state = useGerritState();
	const usedChange = React.useMemo(
		() => state.overriddenChange ?? state.currentChange,
		[state.overriddenChange, state.currentChange]
	);
	const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
	const resolvedRef = React.useRef<HTMLInputElement | null>(null);
	const postCommentsRef = React.useRef<HTMLInputElement | null>(null);
	const debounceType = useDebounce(250);

	const headerStyles = useJoinedStyles(
		styles.header,
		globalStyles.horizontalCenter
	);
	const ccStyles = useJoinedStyles(styles.inputCell, styles.padding);

	const onRevertToCurrent = React.useCallback(() => {
		sendMessage({
			type: 'backToCurrent',
		});
	}, []);

	const onReviewerChange = React.useCallback(
		(newReviewers: ReviewPerson[]) => {
			setEditingState((s) => ({
				...s!,
				reviewers: newReviewers,
			}));
		},
		[]
	);
	const onCCChange = React.useCallback((newCC: ReviewPerson[]) => {
		setEditingState((s) => ({
			...s!,
			cc: newCC,
		}));
	}, []);

	const onMessageChange = React.useCallback(() => {
		if (!textareaRef.current) {
			return;
		}

		const value = textareaRef.current.value;
		sendMessage({
			type: 'commentUpdate',
			body: {
				changeID: currentState.changeID,
				text: value,
			},
		});

		// Update saved state
		const modifiedState: ReviewWebviewState = {
			...state,
			overriddenChange: { ...state.overriddenChange } as
				| ChangeState
				| undefined,
			currentChange: { ...state.currentChange } as
				| ChangeState
				| undefined,
		};
		if (modifiedState.overriddenChange) {
			modifiedState.overriddenChange.message = value;
		} else {
			modifiedState.currentChange!.message = value;
		}
		getAPI().setState(modifiedState);

		// Set editing state
		setEditingState((prevState) => ({
			...prevState!,
			message: value,
		}));
	}, [currentState.changeID, state]);
	const onTextareaType = React.useCallback(
		() => debounceType(onMessageChange),
		[debounceType, onMessageChange]
	);

	const onResolvedStatusChange = React.useCallback(() => {
		if (resolvedRef.current) {
			setTimeout(() => {
				setEditingState((e) => ({
					...e!,
					resolved: resolvedRef.current!.checked,
				}));
			}, 0);
		}
	}, []);

	const onPostCommentsStatusChange = React.useCallback(() => {
		if (postCommentsRef.current) {
			setTimeout(() => {
				setEditingState((e) => ({
					...e!,
					postComments: postCommentsRef.current!.checked,
				}));
			}, 0);
		}
	}, []);

	const onLabelPick = React.useCallback((name: string, value: number) => {
		setEditingState((e) => ({
			...e!,
			labelValues: {
				...e?.labelValues,
				[name]: value,
			},
		}));
	}, []);

	const onSubmit = React.useCallback(() => {
		sendMessage({
			type: 'submit',
			body: {
				changeID: currentState.changeID,
			},
		});
	}, [currentState.changeID]);

	const onPost = React.useCallback(() => {
		sendMessage({
			type: 'publish',
			body: {
				changeID: currentState.changeID,
				cc: editingState?.cc.map((c) => c.id) ?? [],
				reviewers: editingState?.reviewers.map((c) => c.id) ?? [],
				labels: editingState?.labelValues ?? {},
				message: editingState?.message,
				resolved: editingState?.resolved ?? true,
				publishDrafts: editingState?.postComments ?? true,
			},
		});
	}, [
		currentState.changeID,
		editingState?.cc,
		editingState?.labelValues,
		editingState?.message,
		editingState?.postComments,
		editingState?.resolved,
		editingState?.reviewers,
	]);

	// Filter out selected reviewers from CC suggestions and the other way around
	const filteredCurrentState = React.useMemo(() => {
		if (!usedChange || !editingState) {
			return null;
		}
		const { reviewers, cc } = editingState;
		const reviewerIDs = new Set(reviewers.map((r) => r.id));
		const ccIDs = new Set(cc.map((c) => c.id));

		return {
			...usedChange,
			cc: cc.filter((c) => !reviewerIDs.has(c.id)),
			reviewers: reviewers.filter((r) => !ccIDs.has(r.id)),
		};
	}, [usedChange, editingState]);

	React.useEffect(() => {
		if (usedChange) {
			setReset(true);
			setEditingState({
				...usedChange,
				postComments: true,
				resolved: true,
				labelValues: fromEntries(
					usedChange.labels.map((label) => [label.name, 0])
				),
			});
			if (textareaRef.current) {
				textareaRef.current.value = usedChange.message;
			}
			setTimeout(() => setReset(false), 0);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [usedChange?.changeID, usedChange?.fetchedAt]);
	React.useEffect(() => {
		if (textareaRef.current) {
			// Bit of a hack to make the textarea fill the pane
			const root = textareaRef.current.shadowRoot!;
			const child = root.children[1] as HTMLElement;
			child.style.height = '100%';
			textareaRef.current.value = currentState.message;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [textareaRef.current]);
	React.useEffect(() => {
		const listener = (msg: ReviewWebviewMessage): void => {
			if (msg.type === 'publishFailed') {
				setButtonState(StateButtonState.FAILURE);
			} else if (msg.type === 'publishSuccess') {
				setButtonState(StateButtonState.SUCCESS);
			}
		};
		messageListeners.add(listener);
		return () => {
			messageListeners.delete(listener);
		};
	}, []);

	return (
		<div style={styles.container}>
			<div style={headerStyles}>
				<span>{`Change #${currentState.number ?? '?'}`}</span>
				{state.overriddenChange && (
					<div
						className="icon icon-btn"
						style={styles.backToCurrentIcon}
						title="Go back to current change"
						onClick={onRevertToCurrent}
					>
						<i className="codicon codicon-reply"></i>
					</div>
				)}
			</div>
			{state.overriddenChange && (
				<>
					<div style={globalStyles.horizontalCenter}>
						{'(Manually overridden current change)'}
					</div>
					<div style={styles.spacing}></div>
				</>
			)}
			{filteredCurrentState && (
				<div>
					<div style={styles.inputRow}>
						<div style={styles.labelCell}>{'Reviewers:'}</div>
						<div style={styles.inputCell}>
							<ReviewerPicker
								state={filteredCurrentState}
								onChange={onReviewerChange}
								reset={reset}
							/>
						</div>
					</div>
					<div style={styles.inputRow}>
						<div style={styles.labelCell}>{'CC:'}</div>
						<div style={ccStyles}>
							<CCPicker
								state={filteredCurrentState}
								onChange={onCCChange}
								reset={reset}
							/>
						</div>
					</div>
				</div>
			)}
			<div style={styles.spacing}></div>
			<vscode-text-area
				style={styles.textarea}
				ref={textareaRef}
				placeholder={
					currentState.isOwnWIP
						? 'Add a note for your reviewers...'
						: 'Say something nice...'
				}
				onKeyDown={onTextareaType}
			>
				<div
					className="icon"
					style={styles.saveIcon}
					title="Comment is saved when the editor or panel is closed"
				>
					<i className="codicon codicon-save"></i>
				</div>
			</vscode-text-area>
			<div style={styles.spacing}></div>
			<vscode-checkbox
				checked={editingState?.resolved ? true : undefined}
				ref={resolvedRef}
				onClick={onResolvedStatusChange}
			>
				{'Resolved'}
			</vscode-checkbox>
			{currentState.draftCommentCount > 0 && (
				<vscode-checkbox
					checked={editingState?.resolved ? true : undefined}
					ref={resolvedRef}
					onClick={onPostCommentsStatusChange}
				>
					{'Post draft comment(s)'}
				</vscode-checkbox>
			)}
			<div>
				{currentState.isNew &&
					currentState.labels.map((label, i) => (
						<ScorePicker
							key={i}
							name={label.name}
							possibleValues={label.possibleValues}
							onPickValue={onLabelPick}
							reset={reset}
							labelStyle={styles.tinyPadding}
						/>
					))}
			</div>
			<div style={styles.spacing}></div>
			<div style={styles.gap}>
				{currentState.mergeable && (
					<StateButton
						title="Submit patch"
						onSubmit={onSubmit}
						currentState={buttonState}
						onStateUpdate={setButtonState}
					>
						<div style={styles.rightPadding}>{'Submit patch'}</div>
						<span
							slot="end"
							className="codicon codicon-check-all"
						></span>
					</StateButton>
				)}
				{currentState.isOwnWIP ? (
					<StateButton
						title="Post comments and start review for this patch"
						onSubmit={onPost}
						currentState={buttonState}
						onStateUpdate={setButtonState}
					>
						<div style={styles.rightPadding}>
							{'Send and Start Review'}
						</div>
						<span slot="end" className="codicon codicon-add"></span>
					</StateButton>
				) : (
					<StateButton
						title="Post comments"
						onSubmit={onPost}
						currentState={buttonState}
						onStateUpdate={setButtonState}
					>
						<div style={styles.rightPadding}>{'Send'}</div>
						<span
							slot="end"
							className="codicon codicon-comment"
						></span>
					</StateButton>
				)}
			</div>
			<div style={styles.doubleSpacing}></div>
		</div>
	);
};

const styles = createStyles({
	spacing: {
		marginTop: '10px',
	},
	tinyPadding: {
		paddingTop: '5px',
	},
	padding: {
		paddingTop: '10px',
	},
	rightPadding: {
		marginRight: '10px',
	},
	header: {
		fontSize: '1.5em',
		fontWeight: 'bold',
		marginTop: '10px',
		marginBottom: '10px',
	},
	backToCurrentIcon: {
		marginLeft: '5px',
	},
	inputRow: {
		display: 'table-row',
	},
	inputCell: {
		display: 'table-cell',
	},
	labelCell: {
		display: 'table-cell',
		verticalAlign: 'middle',
		paddingRight: '5px',
	},
	doubleSpacing: {
		marginTop: '20px',
	},
	container: {
		height: '100%',
		display: 'flex',
		flexDirection: 'column',
	},
	textarea: {
		width: '100%',
		flexGrow: 100,
		position: 'relative',
	},
	saveIcon: {
		position: 'absolute',
		zIndex: 10,
		right: '10px',
		bottom: '10px',
	},
	gap: {
		display: 'flex',
		flexDirection: 'column',
		gap: '10px',
	},
});
