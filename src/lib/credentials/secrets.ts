import { getConfigurationWithLegacy } from '../vscode/config';
import { SecretStorage, Uri } from 'vscode';

interface UrlOrWorkspaceSecret {
	byUrl: Record<string, string>;
	byWorkspace: Record<string, string>;
}

interface Secrets {
	password: UrlOrWorkspaceSecret;
	cookie: UrlOrWorkspaceSecret;
}

// Could make a fancy TS type for this that extracts it but that's too complex to compute for TS :(
type StoredSecretKeys =
	| `password.byUrl.${string}`
	| `password.byWorkspace.${string}`
	| `cookie.byUrl.${string}`
	| `cookie.byWorkspace.${string}`;

export class GerritSecrets {
	public static secretStorage: SecretStorage;

	private static _get<K extends StoredSecretKeys>(
		key: K
	): Thenable<string | undefined> {
		return this.secretStorage.get(key);
	}

	public static async getForUrlOrWorkspace<
		K extends keyof {
			[K in keyof Secrets]: keyof Secrets[K] extends UrlOrWorkspaceSecret
				? Secrets[K]
				: never;
		},
	>(
		key: K,
		url: string | undefined,
		workspace: Uri | undefined
	): Promise<string | null> {
		if (url) {
			const urlSecret = await this._get(`${key}.byUrl.${url}`);
			if (urlSecret) {
				return urlSecret;
			}
		}

		if (workspace) {
			const workspaceSecret = await this._get(
				`${key}.byWorkspace.${workspace.toString()}`
			);
			if (workspaceSecret) {
				return workspaceSecret;
			}
		}

		const config = getConfigurationWithLegacy();
		return config.get(`gerrit.auth.${key}`) ?? null;
	}

	public static async setForUrlAndWorkspace<
		K extends keyof {
			[K in keyof Secrets]: keyof Secrets[K] extends UrlOrWorkspaceSecret
				? Secrets[K]
				: never;
		},
	>(
		key: K,
		url: string | undefined,
		workspace: Uri | undefined,
		value: string
	): Promise<void> {
		if (url) {
			await this.secretStorage.store(`${key}.byUrl.${url}`, value);
		}
		if (workspace) {
			await this.secretStorage.store(
				`${key}.byWorkspace.${workspace.toString()}`,
				value
			);
		}
	}
}
