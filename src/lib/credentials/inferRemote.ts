// Pure helpers for inferring the Gerrit host/project from git remotes.
// Kept free of `vscode` imports so they can be exercised outside the
// extension host.

export type GitExec = (
	cmd: string
) => Promise<{ success: boolean; stdout: string }>;

export interface ParsedRemoteURL {
	host: string;
	port: string | undefined;
	project: string;
}

/**
 * Finds the name of the remote that most likely points to Gerrit.
 * Does not require a checked-out branch, so it works with a detached
 * HEAD (e.g. when using jj) and with branches that have no upstream.
 */
export async function findRemoteName(
	exec: GitExec,
	options: { preferredRemote?: string; defaultRemote: string }
): Promise<string | null> {
	const remotesResult = await exec('git remote');
	const remotes = remotesResult.success
		? remotesResult.stdout
				.split('\n')
				.map((r) => r.trim())
				.filter(Boolean)
		: [];
	const isRemote = (name: string | undefined): name is string =>
		!!name && remotes.includes(name);

	// 1. Remote explicitly declared by the project (.gitreview)
	if (isRemote(options.preferredRemote)) {
		return options.preferredRemote;
	}

	// 2. Upstream of the current branch. Fails on a detached HEAD or a
	// branch without upstream, which is fine, we just fall through.
	const upstream = await exec(
		'git rev-parse --abbrev-ref --symbolic-full-name @{u}'
	);
	if (upstream.success) {
		const upstreamRemote = upstream.stdout.trim().split('/')[0];
		if (isRemote(upstreamRemote)) {
			return upstreamRemote;
		}
	}

	// 3. Explicitly configured defaults
	for (const key of ['remote.pushDefault', 'checkout.defaultRemote']) {
		const configured = await exec(`git config --get ${key}`);
		const value = configured.stdout.trim();
		if (configured.success && isRemote(value)) {
			return value;
		}
	}

	// 4. Conventional default name, or the only remote there is
	if (isRemote(options.defaultRemote)) {
		return options.defaultRemote;
	}
	if (remotes.length === 1) {
		return remotes[0];
	}
	return null;
}

/**
 * Parses a remote URL into host, port and project. Supports URL-style
 * remotes (ssh://, http://, https://) as well as scp-style remotes
 * (`user@host:project.git`).
 */
export function parseRemoteURL(remoteURL: string): ParsedRemoteURL | null {
	const urlMatch =
		/^(?:ssh|http|https):\/\/(?:[^@/]+@)?([^:/]+)(?::(\d+))?\/(.+?)(?:\.git)?\/?$/.exec(
			remoteURL
		);
	if (urlMatch) {
		const [, host, port, project] = urlMatch;
		return {
			host,
			port,
			project,
		};
	}

	// scp-like syntax. Excludes anything containing "://" and Windows
	// drive paths like "C:\repo" (single-letter "host").
	const scpMatch =
		/^(?:[^@/]+@)?([^:/]{2,}):(?!\/\/)\/?(.+?)(?:\.git)?\/?$/.exec(
			remoteURL
		);
	if (scpMatch) {
		const [, host, project] = scpMatch;
		return {
			host,
			port: undefined,
			project,
		};
	}

	return null;
}
