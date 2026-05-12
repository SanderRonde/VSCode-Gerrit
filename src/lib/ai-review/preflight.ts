import { AgentCommand } from './agentCli';
import { exec } from 'child_process';

export { AgentCommand };

export const MIN_NODE_MAJOR = 18;
export const CURSOR_NODE_PATH = process.execPath;
export const CLI_INSTALL_URL = 'https://cursor.com/docs/cli/installation';
export const CLI_INSTALL_CMD = 'curl https://cursor.com/install -fsS | bash';

export class PreflightError extends Error {
	public readonly recoverable: boolean;

	public constructor(message: string, recoverable: boolean) {
		super(message);
		this.name = 'PreflightError';
		this.recoverable = recoverable;
	}
}

export interface PreflightStatus {
	nodeOk: boolean;
	nodeMajor: number;
	cliFound: boolean;
	agent: AgentCommand;
}

export interface PreflightDeps {
	whichCmd: (name: string) => Promise<boolean>;
	getNodeMajor: () => number;
}

function defaultWhich(name: string): Promise<boolean> {
	return new Promise((resolve) => {
		exec(`which ${name}`, (err, stdout) => {
			resolve(!err && !!stdout.trim());
		});
	});
}

const defaultDeps: PreflightDeps = {
	whichCmd: defaultWhich,
	getNodeMajor: (): number => {
		return parseInt(process.versions.node.split('.')[0], 10);
	},
};

export async function runPreflight(
	deps: PreflightDeps = defaultDeps
): Promise<PreflightStatus> {
	const nodeMajor = deps.getNodeMajor();
	if (nodeMajor < MIN_NODE_MAJOR) {
		throw new PreflightError(
			`Node.js >= ${MIN_NODE_MAJOR} is ` +
				'required for AI Review, but found ' +
				`v${nodeMajor}. Please upgrade ` +
				'Cursor to get a newer bundled ' +
				'Node.js runtime.',
			false
		);
	}

	const hasAgent = await deps.whichCmd('agent');
	if (hasAgent) {
		return {
			nodeOk: true,
			nodeMajor,
			cliFound: true,
			agent: {
				cmd: 'agent',
				baseArgs: [],
			},
		};
	}

	const hasCursor = await deps.whichCmd('cursor');
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

	throw new PreflightError(
		'Cursor Agent CLI not found. ' +
			`Install it with: ${CLI_INSTALL_CMD}` +
			`  (${CLI_INSTALL_URL})`,
		true
	);
}
