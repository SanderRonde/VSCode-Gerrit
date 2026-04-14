import { exec } from 'child_process';
import { AgentCommand } from './agentCli';

export { AgentCommand };

export const MIN_NODE_MAJOR = 18;
export const CLI_INSTALL_URL =
	'https://cursor.com/docs/cli/installation';
export const CLI_INSTALL_CMD =
	'curl https://cursor.com/install -fsS | bash';

export interface PreflightDeps {
	whichCmd: (
		name: string
	) => Promise<boolean>;
	getNodeMajor: () => number;
}

function defaultWhich(
	name: string
): Promise<boolean> {
	return new Promise((resolve) => {
		exec(
			`which ${name}`,
			(err, stdout) => {
				resolve(!err && !!stdout.trim());
			}
		);
	});
}

const defaultDeps: PreflightDeps = {
	whichCmd: defaultWhich,
	getNodeMajor: (): number => {
		return parseInt(
			process.versions.node.split('.')[0],
			10
		);
	},
};

export interface PreflightStatus {
	nodeOk: boolean;
	nodeMajor: number;
	cliFound: boolean;
	agent?: AgentCommand;
	hasNvm?: boolean;
}

export interface PreflightResult {
	ok: boolean;
	agent?: AgentCommand;
	error?: string;
}

export async function runPreflightDetailed(
	deps: PreflightDeps = defaultDeps
): Promise<PreflightStatus> {
	const nodeMajor = deps.getNodeMajor();
	const nodeOk = nodeMajor >= MIN_NODE_MAJOR;

	if (!nodeOk) {
		const hasNvm =
			await deps.whichCmd('nvm');
		return {
			nodeOk: false,
			nodeMajor,
			cliFound: false,
			hasNvm,
		};
	}

	const hasAgent = await deps.whichCmd('agent');
	if (hasAgent) {
		return {
			nodeOk: true,
			nodeMajor,
			cliFound: true,
			agent: { cmd: 'agent', baseArgs: [] },
		};
	}

	const hasCursor =
		await deps.whichCmd('cursor');
	if (hasCursor) {
		return {
			nodeOk: true,
			nodeMajor,
			cliFound: true,
			agent: {
				cmd: 'cursor',
				baseArgs: ['agent'],
			},
		};
	}

	return {
		nodeOk: true,
		nodeMajor,
		cliFound: false,
	};
}

export async function runPreflight(
	deps: PreflightDeps = defaultDeps
): Promise<PreflightResult> {
	const status =
		await runPreflightDetailed(deps);

	if (!status.nodeOk) {
		return {
			ok: false,
			error:
				`Node.js >= ${MIN_NODE_MAJOR} is `
				+ 'required for AI Review, but found '
				+ `v${status.nodeMajor}. `
				+ 'Please upgrade Node.js.',
		};
	}

	if (!status.cliFound) {
		return {
			ok: false,
			error:
				'Cursor Agent CLI not found. '
				+ `Install it with: ${CLI_INSTALL_CMD}`
				+ `  (${CLI_INSTALL_URL})`,
		};
	}

	return {
		ok: true,
		agent: status.agent,
	};
}

