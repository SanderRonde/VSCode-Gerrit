import { commands } from 'vscode';

export interface ContextProps {
	'gerrit.isUsingGerrit': boolean;
}

const contextProps: ContextProps = {
	'gerrit.isUsingGerrit': false,
};

export function setContextProp<K extends keyof ContextProps>(
	key: K,
	value: ContextProps[K]
) {
	contextProps[key] = value;
	commands.executeCommand('setContext', key, value);
}

export function getContextProp<K extends keyof ContextProps>(key: K) {
	return contextProps[key];
}
