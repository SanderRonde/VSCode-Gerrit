import { commands } from 'vscode';

export interface ContextProps {
	'gerrit:isUsingGerrit': boolean;
	'gerrit:connected': boolean;
	'gerrit:searchQuery': string | null;
	'gerrit:searchChangeNumber': number | null;
	'gerrit:isUploader': boolean;
	'gerrit:hasCommentFeature': boolean;
	'gerrit.streamEvents': boolean;
}

const contextProps: ContextProps = {
	'gerrit:isUsingGerrit': false,
	'gerrit:connected': false,
	'gerrit:searchQuery': null,
	'gerrit:searchChangeNumber': null,
	'gerrit:isUploader': false,
	'gerrit:hasCommentFeature': false,
	'gerrit.streamEvents': false,
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

export async function setDefaultContexts(): Promise<void> {
	await Promise.all(
		Object.keys(contextProps).map((key) => {
			const typedKey = key as keyof ContextProps;
			return setContextProp(typedKey, contextProps[typedKey]);
		})
	);
}
