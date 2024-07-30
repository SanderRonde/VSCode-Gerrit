import { ExtensionContext, ExtensionMode } from 'vscode';
import { logDev } from './log';

let context: ExtensionContext | null = null;
export function setDevContext(ctx: ExtensionContext): void {
	context = ctx;
}

// Dev
// TODO:(Sander)
const IS_DEV_OVERRIDE: boolean | null = true;
export function isDev(): boolean {
	if (process.env.DEV_OVERRIDE) {
		return true;
	}
	if (!context) {
		// Use `logDev` to prevent an infinite loop
		logDev(
			'isDev called before context was set, returning false. Please flag this issue'
		);
		return false;
	}
	if (IS_DEV_OVERRIDE !== null) {
		if (context.extensionMode === ExtensionMode.Production) {
			// Use `logDev` to prevent an infinite loop
			logDev(
				'isDev override set in prod build (or context not set at call time), assuming prod mode. Please flag this issue'
			);
			return false;
		}
		return IS_DEV_OVERRIDE;
	}
	return context.extensionMode === ExtensionMode.Development;
}

/**
 * Don't allow any writing API requests (only GET)
 */
const READONLY_MODE_DEFAULT: boolean = false;
export const shouldUseReadonlyMode = (): boolean => {
	if (isDev()) {
		return READONLY_MODE_DEFAULT;
	} else {
		return false;
	}
};
export const shouldDebugRequests = isDev;

/**
 * Log disposing of garbage collected items
 */
const DEBUG_GARBAGE_COLLECTION_DEFAULT: boolean = false;
export const shouldDebugGarbageCollection = (): boolean => {
	if (isDev()) {
		return DEBUG_GARBAGE_COLLECTION_DEFAULT;
	} else {
		return false;
	}
};
