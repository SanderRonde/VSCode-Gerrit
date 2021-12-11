import { createStyles } from '../lib/style';
import * as React from 'react';

type PickerProps<T> = {
	items: T[];
	getLabel: (value: T) => string;
	getShort: (value: T) => string;
	value: T[];
	initialValue: T[];
	onChange: (values: T[]) => void;
	onSearch?: (query: string) => void;
	itemIsSame: (a: T, b: T) => boolean;
	isLocked: (value: T) => boolean;
	reset: boolean;
};

export function Picker<T>(props: PickerProps<T>): React.ReactElement {
	const [isOpen, setIsOpen] = React.useState<boolean>(false);
	const [value, setValue] = React.useState<T[]>(props.initialValue);
	const [keyboardSelected, setKeyboardSelected] = React.useState<number>(0);

	const selfRef = React.useRef<HTMLDivElement>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);

	const isInArray = (arr: T[], value: T): boolean => {
		for (const arrValue of arr) {
			if (props.itemIsSame(arrValue, value)) {
				return true;
			}
		}
		return false;
	};

	const setClosed = React.useCallback(() => setIsOpen(false), []);
	const setOpen = React.useCallback(() => setIsOpen(true), []);
	const pOnSearch = props.onSearch;
	const onOptionClick = React.useCallback(
		(item: T) => {
			if (props.isLocked(item)) {
				return;
			}
			return () => {
				setValue((prevValue) => {
					const newValues: T[] = [];
					let found: boolean = false;
					for (const value of prevValue) {
						if (props.itemIsSame(item, value)) {
							// Skip
							found = true;
						} else {
							newValues.push(value);
						}
					}
					if (!found) {
						newValues.push(item);
					}

					if (inputRef.current) {
						inputRef.current.value = '';
					}
					props.onSearch?.('');
					props.onChange(newValues);
					return newValues;
				});
			};
		},
		[props]
	);
	const onSearch = React.useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === 'Enter') {
				// Select/deselect current
				const currentIndex = Math.max(
					0,
					Math.min(keyboardSelected, props.items.length - 1)
				);
				const option = props.items[currentIndex];
				if (option) {
					onOptionClick(option)?.();
				}
			} else if (e.key === 'ArrowUp') {
				setKeyboardSelected((c) =>
					Math.max(0, Math.min(c - 1, props.items.length - 1))
				);
				e.preventDefault();
			} else if (e.key === 'ArrowDown') {
				setKeyboardSelected((c) =>
					Math.max(0, Math.min(c + 1, props.items.length - 1))
				);
				e.preventDefault();
			} else if (e.key === 'Escape') {
				setClosed();
			} else {
				setIsOpen(true);
				const element = e.target as HTMLInputElement | null;
				setTimeout(() => {
					if (element) {
						pOnSearch?.(element.value);
					}
				}, 0);
			}
		},
		[keyboardSelected, props.items, onOptionClick, setClosed, pOnSearch]
	);

	React.useEffect(() => {
		const listener = (): void => {
			setClosed();
		};
		window.addEventListener('mousedown', listener);
		return () => {
			window.removeEventListener('mousedown', listener);
		};
	}, [setClosed]);

	React.useEffect(() => {
		if (selfRef.current) {
			const listener = (e: MouseEvent): void => void e.stopPropagation();
			const ref = selfRef.current;
			ref.addEventListener('mousedown', listener);

			return () => {
				ref?.removeEventListener('mousedown', listener);
			};
		}
		return undefined;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selfRef.current]);

	React.useEffect(() => {
		if (props.reset) {
			setValue(props.initialValue);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.reset]);

	return (
		<div style={styles.container} ref={selfRef}>
			<vscode-text-field
				onClick={setOpen}
				onKeyDown={onSearch}
				ref={inputRef}
			>
				{value.length > 0 && (
					<span slot="start" style={styles.chipContainer}>
						{value.map((value, i) => (
							<div
								style={styles.chip}
								key={i}
								title={props.getLabel(value)}
							>
								{props.getShort(value)}
							</div>
						))}
					</span>
				)}
			</vscode-text-field>
			{isOpen && (
				<div style={styles.dropdownContainer}>
					{props.items.map((item, i, arr) => (
						<vscode-option
							{...{ 'aria-selected': isInArray(value, item) }}
							selected={isInArray(value, item)}
							onClick={onOptionClick(item)}
							title={`${props.getLabel(item)} ${
								props.isLocked(item) ? '(locked)' : ''
							}`}
							style={
								keyboardSelected === i ||
								(i === arr.length - 1 && keyboardSelected >= i)
									? styles.keyboardSelected
									: undefined
							}
						>
							<div style={styles.optionContainer}>
								<span>{props.getLabel(item)}</span>
								{props.isLocked(item) && (
									<i
										style={styles.lockedIcon}
										title="Locked, can't be removed"
										className="codicon codicon-lock-small"
									></i>
								)}
							</div>
						</vscode-option>
					))}
				</div>
			)}
		</div>
	);
}

const styles = createStyles({
	container: {
		width: '100%',
		display: 'flex',
		flexDirection: 'column',
		position: 'relative',
	},
	keyboardSelected: {
		border: 'calc(var(--border-width) * 1px) solid var(--focus-border)',
	},
	input: {
		background: 'var(--vscode-input-background)',
		color: 'var(--vscode-input-foreground)',
		height: '26px',
	},
	menuItem: {
		background: 'var(--vscode-input-background)',
		color: 'var(--vscode-input-foreground)',
		minHeight: 'unset',
		height: '26px',
	},
	chip: {
		color: 'var(--vscode-quickInput-foreground)',
		backgroundColor: 'var(--vscode-quickInput-background)',
		borderRadius: '16px',
		paddingLeft: '5px',
		paddingRight: '5px',
		marginTop: '-1px',
		marginRight: '2px',
	},
	selectedMenuItem: {
		fontWeight: 'bold',
	},
	dropdownContainer: {
		border: '1px solid var(--vscode-focusBorder)',
		display: 'flex',
		flexDirection: 'column',
		backgroundColor: 'var(--vscode-input-background)',
		position: 'absolute',
		zIndex: 100,
		width: '100%',
		marginTop: '26px',
	},
	chipContainer: {
		width: 'auto',
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'flex-start',
	},
	lockedIcon: {
		right: '5px',
		position: 'absolute',
	},
	optionContainer: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
});
