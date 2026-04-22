import { getGerritURLFromReviewFile } from '../credentials/enterCredentials';
import { getGitReviewFileCached } from '../credentials/gitReviewFile';
import { writeMcpConfig, GerritCredentials } from '../mcp/mcpManager';
import {
	window,
	workspace,
	ExtensionContext,
	ProgressLocation,
} from 'vscode';
import { GerritSecrets } from '../credentials/secrets';
import { spawn } from 'child_process';
import { tryExecAsync } from '../git/gitCLI';
import { getGerritRepo } from '../gerrit/gerrit';
import {
  UserCancelledError,
  isUserCancelledError,
} from '../util/errors';
import { log } from '../util/log';
import { getConfiguration } from '../vscode/config';
import { runPreflight } from './preflight';
import {
  AgentCommand,
  buildMcpEnableCommand,
  buildLoginCommand,
} from './agentCli';
import { selectAiModel } from './modelSelector';


type CheckoutBehavior = 'ask' | 'always' | 'never';

interface PrerequisiteResult {
  agent: AgentCommand;
}

export async function enableAiReview(
  context: ExtensionContext
): Promise<void> {
  try {
    const config = getConfiguration();

    const { agent } =
      await resolvePrerequisites();

  const modelResult = await selectAiModel();
  if (modelResult === undefined) {
    void window.showInformationMessage(
      'AI Review setup cancelled.'
    );
    throw new UserCancelledError('selectModel');
  }

  const checkoutBehavior =
    await pickCheckoutBehavior();
  if (!checkoutBehavior) {
    void window.showInformationMessage(
      'AI Review setup cancelled.'
    );
    return;
  }

  await config.update(
    'gerrit.aiReview.checkoutBehavior',
    checkoutBehavior
  );

  const ok = await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'Gerrit: Setting up AI Review',
      cancellable: false,
    },
    async (progress) => {
      progress.report({
        message: 'Extracting credentials...',
      });

      const credentials =
        await extractCredentials(context);
      if (!credentials) {
        void window.showWarningMessage(
          'Could not extract Gerrit credentials. '
          + 'Please configure them via "Gerrit: '
          + 'Enter Credentials" first.'
        );
        return false;
      }

      progress.report({
        message: 'Writing MCP configuration...',
        increment: 30,
      });

      const mcpOk = await writeMcpConfig(
        context.extensionPath,
        credentials
      );
      if (!mcpOk) {
        void window.showWarningMessage(
          'Failed to write MCP config. AI Review '
          + 'may not have full Gerrit integration.'
        );
        return false;
      }

      progress.report({
        message: 'Enabling MCP server...',
        increment: 30,
      });

      const mcpEnabled = await enableMcpServer(agent);
      if (!mcpEnabled) {
        return false;
      }

      progress.report({
        message: 'Finalizing...',
        increment: 30,
      });

      await config.update(
        'gerrit.aiReview.enabled', true
      );

      return true;
    }
  );

  if (!ok) {
    return;
  }

  void window.showInformationMessage(
    'AI Review enabled! Use "Gerrit: AI Review '
    + 'Change" from the command palette or '
    + 'click the "AI Review Change" button '
    + 'in the Change Explorer view.'
  );
  log('AI Review enabled successfully');
  } catch (e: unknown) {
    if (isUserCancelledError(e)) {
      log('AI Review setup cancelled');
      return;
    }
    const msg = e instanceof Error
      ? e.message : String(e);
    log('AI Review setup failed: ' + msg);
    void window.showErrorMessage(
      'AI Review setup failed: ' + msg
    );
  }
}

// ── Prerequisite resolution ─────────────────────

async function resolvePrerequisites(): Promise<
  PrerequisiteResult
> {
  const status = await runPreflight();

  const alreadyLoggedIn = await isAgentLoggedIn(
    status.agent
  );
  if (!alreadyLoggedIn) {
    const fixed = await promptAgentLogin(
      status.agent
    );
    if (!fixed) {
      throw new UserCancelledError('agentLogin');
    }
  }

  return { agent: status.agent };
}

const STATUS_TIMEOUT_MS = 5_000;

async function isAgentLoggedIn(
  agent: AgentCommand
): Promise<boolean> {
  const args = [...agent.baseArgs, 'status'];
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const proc = spawn(agent.cmd, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const finish = (result: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      proc.kill();
      resolve(result);
    };

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (/not\s*logged\s*in/i.test(text)) {
        finish(false);
      } else if (/logged\s*in/i.test(text)) {
        finish(true);
      }
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        reject(new Error(
          'Timed out checking login status. '
          + 'Please run "agent login" manually '
          + 'in a terminal and retry.'
        ));
      }
    }, STATUS_TIMEOUT_MS);

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    proc.on('close', () => {
      finish(false);
    });
  });
}

async function waitForUserDone(
  message: string
): Promise<void> {
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: message,
      cancellable: true,
    },
    (_progress, token) =>
      new Promise<void>((resolve) => {
        token.onCancellationRequested(resolve);
      })
  );
}

async function promptAgentLogin(
  agent: AgentCommand
): Promise<boolean> {
  const pick = await window.showInformationMessage(
    'Cursor Agent CLI requires authentication.',
    'Login',
    'Cancel'
  );

  if (pick === 'Login') {
    const term = window.createTerminal(
      'Cursor Agent Login'
    );
    term.show();
    term.sendText(buildLoginCommand(agent));
    await waitForUserDone(
      'Logging in \u2014 cancel when done'
    );
    return true;
  }

  return false;
}

async function pickCheckoutBehavior(): Promise<CheckoutBehavior | undefined> {
	const items = [
		{
			label: 'Ask each time',
			description:
				'Prompt before each review whether ' + 'to checkout the change',
			value: 'ask' as CheckoutBehavior,
		},
		{
			label: 'Always checkout',
			description: 'Automatically checkout for full ' + 'repo context',
			value: 'always' as CheckoutBehavior,
		},
		{
			label: 'Never checkout',
			description:
				'Review using Gerrit context only ' + '(no local checkout)',
			value: 'never' as CheckoutBehavior,
		},
	];

	const selected = await window.showQuickPick(items, {
		placeHolder: 'How should AI Review handle ' + 'change checkout?',
		title: 'Gerrit: Checkout Behavior',
	});

	return selected?.value;
}

async function extractCredentials(
	context: ExtensionContext
): Promise<GerritCredentials | null> {
	const config = getConfiguration();
	const gerritRepo = await getGerritRepo(context);
	const gitReviewFile = gerritRepo
		? await getGitReviewFileCached(gerritRepo)
		: null;

	const url = getGerritURLFromReviewFile(gitReviewFile);
	if (!url) {
		return null;
	}

	const username = config.get('gerrit.auth.username') ?? '';
	const password = await GerritSecrets.getForUrlOrWorkspace(
		'password',
		url,
		workspace.workspaceFolders?.[0]?.uri
	);
	const cookie = await GerritSecrets.getForUrlOrWorkspace(
		'cookie',
		url,
		workspace.workspaceFolders?.[0]?.uri
	);
	const authPrefix = config.get('gerrit.customAuthUrlPrefix', 'a/');

	if (!username && !password && !cookie) {
		return null;
	}

	return {
		url,
		username,
		password: password ?? '',
		authCookie: cookie ?? undefined,
		authPrefix,
	};
}

async function enableMcpServer(
  agent: AgentCommand
): Promise<boolean> {
  const cwd =
    workspace.workspaceFolders?.[0]?.uri.fsPath;

  const cmd = buildMcpEnableCommand(
    agent, 'gerrit-review'
  );
  const { success, stderr } = await tryExecAsync(
    cmd,
    { silent: true, cwd }
  );

  if (success) {
    log('MCP server auto-approved');
    return true;
  }

  log(
    'Could not auto-approve MCP server: '
    + stderr
  );

  const action = await window.showWarningMessage(
    'Failed to auto-enable the MCP server. '
    + 'You may need to enable "gerrit-review" '
    + 'manually in Cursor MCP settings.',
    'Retry',
    'Continue Anyway'
  );

  if (action === 'Retry') {
    return enableMcpServer(agent);
  }

  return action === 'Continue Anyway';
}
