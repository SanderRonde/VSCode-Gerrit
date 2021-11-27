import { commands } from 'vscode';

export interface ContextProps {
	'gerrit.isUsingGerrit': boolean;
}

const contextProps: ContextProps = {
	'gerrit.isUsingGerrit': false,
};

export async function setContextProp<K extends keyof ContextProps>(
	key: K,
	value: ContextProps[K]
): Promise<void> {
	contextProps[key] = value;
	await commands.executeCommand('setContext', key, value);
}

export function getContextProp<K extends keyof ContextProps>(
	key: K
): ContextProps[K] {
	return contextProps[key];
}
