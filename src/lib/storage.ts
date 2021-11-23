import { ExtensionContext } from 'vscode';

export enum StorageScope {
	WORKSPACE,
	GLOBAL,
}

interface StorageObj {
	'activityBar.changes.yourTurn.collapsed': boolean;
	'activityBar.changes.wip.collapsed': boolean;
	'activityBar.changes.outgoing.collapsed': boolean;
	'activityBar.changes.incoming.collapsed': boolean;
	'activityBar.changes.cced.collapsed': boolean;
	'activityBar.changes.recentlyClosed.collapsed': boolean;
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
