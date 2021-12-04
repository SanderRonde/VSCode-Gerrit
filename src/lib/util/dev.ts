import { ExtensionContext, ExtensionMode } from 'vscode';
import { logDev } from './log';

let context: ExtensionContext | null = null;
export function setDevContext(ctx: ExtensionContext): void {
	context = ctx;
}

// Dev
const IS_DEV_OVERRIDE: boolean | null = null;
export function isDev(): boolean {
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
