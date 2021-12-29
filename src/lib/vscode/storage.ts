import { QuickCheckoutApplyInfo } from '../git/quick-checkout';
import { createInittableValue } from '../util/cache';
import { ExtensionContext } from 'vscode';

export enum StorageScope {
	WORKSPACE,
	GLOBAL,
}

interface StorageObj {
	reviewComment: {
		project: string;
		changeID: string;
		comment: string;
		patchSet: number;
		// Number-representation of a date
		setAt: number;
	} | null;
	/**
	 * Change ID to use for the patchset panel
	 * instead of the current change
	 */
	reviewChangeIDOverride: string | null;
	streamEventsAsked?: boolean;
	quickCheckoutStashes: QuickCheckoutApplyInfo[];
	askedDropAllStashes?: boolean;
	askedQuickCheckoutsStatusBar?: boolean;
}

const SYNC_KEYS: (keyof StorageObj)[] = [
	'reviewComment',
	'reviewChangeIDOverride',
	'streamEventsAsked',
	'askedDropAllStashes',
	'askedQuickCheckoutsStatusBar',
];

const ctx = createInittableValue<ExtensionContext>();
export async function storageSet<K extends keyof StorageObj>(
	key: K,
	value: StorageObj[K],
	scope: StorageScope
): Promise<void> {
	if (scope === StorageScope.WORKSPACE) {
		await (await ctx.get()).workspaceState.update(key, value);
	} else {
		await (await ctx.get()).globalState.update(key, value);
	}
}

export async function storageGet<K extends keyof StorageObj>(
	key: K,
	scope: StorageScope,
	defaultValue: StorageObj[K]
): Promise<StorageObj[K]>;
export async function storageGet<K extends keyof StorageObj>(
	key: K,
	scope: StorageScope
): Promise<StorageObj[K] | undefined>;
export async function storageGet<K extends keyof StorageObj>(
	key: K,
	scope: StorageScope,
	defaultValue?: StorageObj[K]
): Promise<StorageObj[K] | undefined> {
	if (scope === StorageScope.WORKSPACE) {
		return (
			(await ctx.get()).workspaceState.get<StorageObj[K]>(key) ??
			defaultValue
		);
	} else {
		return (
			(await ctx.get()).globalState.get<StorageObj[K]>(key) ??
			defaultValue
		);
	}
}

export function storageInit(context: ExtensionContext): void {
	ctx.init(context);
	context.globalState.setKeysForSync(SYNC_KEYS);
}
