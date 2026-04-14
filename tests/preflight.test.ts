import * as assert from 'assert';
import {
	runPreflight,
	PreflightDeps,
} from '../src/lib/ai-review/preflight';
import {
	buildMcpEnableCommand,
} from '../src/lib/ai-review/agentCli';

function makeDeps(
	overrides: Partial<PreflightDeps> = {}
): PreflightDeps {
	return {
		whichCmd: overrides.whichCmd
			?? (async (_name: string) => false),
		getNodeMajor: overrides.getNodeMajor
			?? (() => 20),
	};
}

describe('runPreflight', () => {
	it('returns error when Node < 18', async () => {
		const deps = makeDeps({
			getNodeMajor: () => 16,
		});
		const result = await runPreflight(deps);

		assert.strictEqual(result.ok, false);
		assert.ok(result.error);
		assert.ok(
			result.error.includes('Node.js >= 18')
		);
		assert.strictEqual(
			result.agent, undefined
		);
	});

	it('returns error when Node is exactly 17', async () => {
		const deps = makeDeps({
			getNodeMajor: () => 17,
		});
		const result = await runPreflight(deps);

		assert.strictEqual(result.ok, false);
		assert.ok(
			result.error!.includes('v17')
		);
	});

	it('succeeds with Node 18', async () => {
		const deps = makeDeps({
			getNodeMajor: () => 18,
			whichCmd: async (name: string) =>
				name === 'agent',
		});
		const result = await runPreflight(deps);

		assert.strictEqual(result.ok, true);
		assert.ok(result.agent);
	});

	it(
		'prefers standalone agent CLI when available',
		async () => {
			const deps = makeDeps({
				whichCmd: async (_name: string) => true,
			});
			const result = await runPreflight(deps);

			assert.strictEqual(result.ok, true);
			assert.strictEqual(
				result.agent!.cmd, 'agent'
			);
			assert.deepStrictEqual(
				result.agent!.baseArgs, []
			);
		}
	);

	it(
		'falls back to cursor agent when agent is '
		+ 'not found',
		async () => {
			const deps = makeDeps({
				whichCmd: async (name: string) =>
					name === 'cursor',
			});
			const result = await runPreflight(deps);

			assert.strictEqual(result.ok, true);
			assert.strictEqual(
				result.agent!.cmd, 'cursor'
			);
			assert.deepStrictEqual(
				result.agent!.baseArgs, ['agent']
			);
		}
	);

	it(
		'returns error when neither agent nor cursor '
		+ 'are available',
		async () => {
			const deps = makeDeps({
				whichCmd: async (_name: string) => false,
			});
			const result = await runPreflight(deps);

			assert.strictEqual(result.ok, false);
			assert.ok(result.error);
			assert.ok(
				result.error.includes(
					'Cursor Agent CLI not found'
				)
			);
			assert.ok(
				result.error.includes('cursor.com/install')
			);
		}
	);

	it(
		'checks Node version before CLI detection',
		async () => {
			const whichNames: string[] = [];
			const deps: PreflightDeps = {
				getNodeMajor: () => 14,
				whichCmd: async (name: string) => {
					whichNames.push(name);
					return false;
				},
			};
			const result = await runPreflight(deps);

			assert.strictEqual(result.ok, false);
			assert.ok(
				!whichNames.includes('agent'),
				'should not probe for agent CLI'
			);
			assert.ok(
				!whichNames.includes('cursor'),
				'should not probe for cursor CLI'
			);
		}
	);
});

describe('buildMcpEnableCommand', () => {
	it('builds command for standalone agent', () => {
		const cmd = buildMcpEnableCommand(
			{ cmd: 'agent', baseArgs: [] },
			'gerrit-review'
		);
		assert.strictEqual(
			cmd,
			'agent mcp enable gerrit-review'
		);
	});

	it('builds command for cursor agent fallback', () => {
		const cmd = buildMcpEnableCommand(
			{
				cmd: 'cursor',
				baseArgs: ['agent'],
			},
			'gerrit-review'
		);
		assert.strictEqual(
			cmd,
			'cursor agent mcp enable gerrit-review'
		);
	});
});

