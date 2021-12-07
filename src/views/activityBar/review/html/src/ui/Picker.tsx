import { createStyles } from '../lib/style';
import * as React from 'react';

type PickerProps<T> = {
	items: T[];
	getLabel: (value: T) => string;
	getShort: (value: T) => string;
	value: T[];
	onChange: (values: T[]) => void;
	onSearch?: (query: string) => void;
	itemIsSame: (a: T, b: T) => boolean;
};

export function Picker<T>(props: PickerProps<T>): React.ReactElement {
	const [isOpen, setIsOpen] = React.useState<boolean>(false);
	const [value, setValue] = React.useState<T[]>(props.value);

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
	const onSearch = React.useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			setIsOpen(true);
			const element = e.target as HTMLInputElement | null;
			setTimeout(() => {
				if (element) {
					props.onSearch?.(element.value);
				}
			}, 0);
		},
		[props]
	);
	const onOptionClick = React.useCallback(
		(item: T) => {
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
					props.onChange(newValues);
					return newValues;
				});
			};
		},
		[props]
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
					{props.items.map((item) => (
						<vscode-option
							{...{ 'aria-selected': isInArray(value, item) }}
							selected={isInArray(value, item)}
							onClick={onOptionClick(item)}
						>
							{props.getLabel(item)}
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
		color: 'var(--vscode-input-foreground)',
		backgroundColor: 'var(--vscode-activityBar-background)',
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
});
