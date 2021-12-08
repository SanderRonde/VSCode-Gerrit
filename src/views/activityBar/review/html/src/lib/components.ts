import {
	vsCodeTextField,
	vsCodeOption,
	vsCodeTextArea,
	vsCodeCheckbox,
	vsCodeButton,
	vsCodeProgressRing,
} from '@vscode/webview-ui-toolkit/dist/toolkit';

export function registerComponents(): void {
	vsCodeTextField();
	vsCodeOption();
	vsCodeTextArea();
	vsCodeCheckbox();
	vsCodeButton();
	vsCodeProgressRing();
}

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace JSX {
		interface IntrinsicElements {
			'vscode-text-field': IntrinsicElements['input'];
			'vscode-option': IntrinsicElements['div'] & {
				selected?: boolean;
			};
			'vscode-text-area': IntrinsicElements['textarea'] & {
				label?: string;
				placeholder?: string;
				rows?: string;
				cols?: string;
			};
			'vscode-checkbox': IntrinsicElements['input'];
			'vscode-button': IntrinsicElements['button'];
			'vscode-progress-ring': IntrinsicElements['div'];
		}
	}
}
