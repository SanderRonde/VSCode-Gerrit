import { ChangesPanel } from '../lib/vscode/config';

export interface ChangesView {
	title: string;
	panels: ChangesPanel[];
}
export enum ExpandComments {
	ALWAYS = 'always',
	NEVER = 'never',
	UNRESOLVED = 'unresolved',
}
