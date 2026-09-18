const NON_GERRIT_HOSTS = new Set([
	'github.com',
	'gitlab.com',
	'bitbucket.org',
	'gitlab.org',
]);

/**
 * Remote URLs for GitHub/GitLab/Bitbucket are not Gerrit servers.
 * Inferring `https://github.com` as the Gerrit auth URL breaks setup.
 */
export function isLikelyGerritHost(host: string): boolean {
	const normalized = host
		.trim()
		.replace(/^https?:\/\//, '')
		.replace(/[:/].*$/, '')
		.replace(/^www\./, '')
		.toLowerCase();
	if (!normalized) {
		return false;
	}
	for (const known of NON_GERRIT_HOSTS) {
		if (normalized === known || normalized.endsWith(`.${known}`)) {
			return false;
		}
	}
	return true;
}
