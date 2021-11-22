import { ExtensionContext } from 'vscode';

export enum StorageScope {
	WORKSPACE,
	GLOBAL,
}

interface StorageObj {
	'activityBar.patches.yourTurn.collapsed': boolean;
	'activityBar.patches.wip.collapsed': boolean;
	'activityBar.patches.outgoing.collapsed': boolean;
	'activityBar.patches.incoming.collapsed': boolean;
	'activityBar.patches.cced.collapsed': boolean;
	'activityBar.patches.recentlyClosed.collapsed': boolean;
}

const SYNC_KEYS: (keyof StorageObj)[] = [] as (keyof StorageObj)[];

export async function storageSet<K extends keyof StorageObj>(
	ctx: ExtensionContext,
	key: K,
	value: StorageObj[K],
	scope: StorageScope
) {
	if (scope === StorageScope.WORKSPACE) {
		await ctx.workspaceState.update(key, value);
	} else {
		await ctx.globalState.update(key, value);
	}
}

export function storageGet<K extends keyof StorageObj>(
	ctx: ExtensionContext,
	key: K,
	scope: StorageScope,
	defaultValue: StorageObj[K]
): StorageObj[K];
export function storageGet<K extends keyof StorageObj>(
	ctx: ExtensionContext,
	key: K,
	scope: StorageScope
): StorageObj[K] | undefined;
export function storageGet<K extends keyof StorageObj>(
	ctx: ExtensionContext,
	key: K,
	scope: StorageScope,
	defaultValue?: StorageObj[K]
): StorageObj[K] | undefined {
	if (scope === StorageScope.WORKSPACE) {
		return ctx.workspaceState.get<StorageObj[K]>(key) ?? defaultValue;
	} else {
		return ctx.globalState.get<StorageObj[K]>(key) ?? defaultValue;
	}
}

export function storageInit(ctx: ExtensionContext) {
	ctx.globalState.setKeysForSync(SYNC_KEYS);
}
