import { getConfiguration } from '../vscode/config';
import { window } from 'vscode';

export interface AIModel {
	label: string;
	id: string;
}

const AVAILABLE_MODELS: AIModel[] = [
	{ label: 'Auto (let Cursor decide)', id: '' },
	{ label: 'Claude 4.6 Opus', id: 'claude-4.6-opus' },
	{ label: 'Claude 4.5 Sonnet', id: 'claude-4.5-sonnet' },
	{ label: 'Claude 3.5 Sonnet', id: 'claude-3.5-sonnet' },
	{ label: 'GPT-4o', id: 'gpt-4o' },
	{ label: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro' },
	{ label: '$(edit) Enter custom model ID...', id: '__custom__' },
];

export async function selectAiModel(): Promise<string | undefined> {
	const config = getConfiguration();
	const currentModel = config.get('gerrit.aiReview.defaultModel', '');

	const items = AVAILABLE_MODELS.map((m) => ({
		label: m.label,
		description: m.id === currentModel ? '(current)' : undefined,
		id: m.id,
	}));

	const selected = await window.showQuickPick(items, {
		placeHolder: 'Select default AI model for reviews',
		title: 'Gerrit: Select AI Review Model',
	});

	if (!selected) {
		return undefined;
	}

	let modelId = selected.id;

	// Handle custom model entry
	if (modelId === '__custom__') {
		const customId = await window.showInputBox({
			prompt: 'Enter custom model ID (e.g., gpt-5.2)',
			placeHolder: 'model-id',
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Model ID cannot be empty';
				}
				return null;
			},
		});

		if (!customId) {
			return undefined;
		}

		modelId = customId.trim();
	}

	await config.update('gerrit.aiReview.defaultModel', modelId);

	return modelId;
}

export function getDefaultModel(): string {
	return getConfiguration().get('gerrit.aiReview.defaultModel', '');
}
