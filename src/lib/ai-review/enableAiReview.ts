import { getGerritURLFromReviewFile } from '../credentials/enterCredentials';
import { getGitReviewFileCached } from '../credentials/gitReviewFile';
import { GerritSecrets } from '../credentials/secrets';
import { spawn } from 'child_process';
import { tryExecAsync } from '../git/gitCLI';
import { getGerritRepo } from '../gerrit/gerrit';
import { writeMcpConfig, GerritCredentials } from '../mcp/mcpManager';
import {
  UserCancelledError,
  isUserCancelledError,
} from '../util/errors';
import { log } from '../util/log';
import { getConfiguration } from '../vscode/config';
import {
  runPreflightDetailed,
  PreflightStatus,
  MIN_NODE_MAJOR,
  CLI_INSTALL_CMD,
  CLI_INSTALL_URL,
} from './preflight';
import {
  AgentCommand,
  buildMcpEnableCommand,
  buildStatusCommand,
  buildLoginCommand,
} from './agentCli';
import { selectAiModel } from './modelSelector';
import {
  window, workspace, env, Uri,
  ExtensionContext, ProgressLocation,
} from 'vscode';

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
      throw new UserCancelledError('selectModel');
    }

    const checkoutBehavior =
      await pickCheckoutBehavior();
    if (!checkoutBehavior) {
      throw new UserCancelledError(
        'checkoutBehavior'
      );
    }

    await config.update(
      'gerrit.aiReview.checkoutBehavior',
      checkoutBehavior
    );

    const credentials = await extractCredentials(
      context
    );
    if (!credentials) {
      throw new Error(
        'Could not extract Gerrit credentials. '
        + 'Please configure them via "Gerrit: '
        + 'Enter Credentials" first.'
      );
    }

    const mcpOk = await writeMcpConfig(
      context.extensionPath,
      credentials
    );
    if (!mcpOk) {
      void window.showWarningMessage(
        'Failed to write MCP config. AI Review '
        + 'may not have full Gerrit integration.'
      );
    } else {
      await enableMcpServer(agent);
    }

    await config.update(
      'gerrit.aiReview.enabled', true
    );

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
  let status = await runPreflightDetailed();

  if (!status.nodeOk) {
    const fixed = await promptNodeUpgrade(status);
    if (!fixed) {
      throw new UserCancelledError('nodeUpgrade');
    }
    status = await runPreflightDetailed();
    if (!status.nodeOk) {
      throw new Error(
        `Node.js >= ${MIN_NODE_MAJOR} is still `
        + 'required. Please upgrade and retry.'
      );
    }
  }

  if (!status.cliFound) {
    const fixed = await promptCliInstall();
    if (!fixed) {
      throw new UserCancelledError('cliInstall');
    }
    status = await runPreflightDetailed();
    if (!status.cliFound || !status.agent) {
      throw new Error(
        'Cursor CLI is still not detected. '
        + 'Please install it and retry.'
      );
    }
  }

  if (!status.agent) {
    throw new Error(
      'Could not detect Cursor Agent CLI.'
    );
  }

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

async function promptNodeUpgrade(
  status: PreflightStatus
): Promise<boolean> {
  const actions: string[] = [
    'Open nodejs.org',
  ];
  if (status.hasNvm) {
    actions.unshift('Run nvm install --lts');
  }
  actions.push('Cancel');

  const pick = await window.showWarningMessage(
    `Node.js >= ${MIN_NODE_MAJOR} is required, `
    + `but found v${status.nodeMajor}.`,
    ...actions
  );

  if (pick === 'Run nvm install --lts') {
    const term = window.createTerminal(
      'Node Upgrade'
    );
    term.show();
    term.sendText(
      'nvm install --lts && nvm use --lts'
    );
    await waitForUserDone(
      'Upgrading Node.js \u2014 cancel when done'
    );
    return true;
  }

  if (pick === 'Open nodejs.org') {
    void env.openExternal(
      Uri.parse('https://nodejs.org/')
    );
    await waitForUserDone(
      'Upgrading Node.js \u2014 cancel when done'
    );
    return true;
  }

  return false;
}

async function promptCliInstall(): Promise<
  boolean
> {
  const pick = await window.showWarningMessage(
    'Cursor Agent CLI not found.',
    'Install Now',
    'Show Instructions',
    'Cancel'
  );

  if (pick === 'Install Now') {
    const term = window.createTerminal(
      'Cursor CLI Install'
    );
    term.show();
    term.sendText(CLI_INSTALL_CMD);
    await waitForUserDone(
      'Installing Cursor CLI \u2014 cancel when done'
    );
    return true;
  }

  if (pick === 'Show Instructions') {
    void env.openExternal(
      Uri.parse(CLI_INSTALL_URL)
    );
    await waitForUserDone(
      'Installing Cursor CLI \u2014 cancel when done'
    );
    return true;
  }

  return false;
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

async function pickCheckoutBehavior(): Promise<
  CheckoutBehavior | undefined
> {
  const items = [
    {
      label: 'Ask each time',
      description:
        'Prompt before each review whether '
        + 'to checkout the change',
      value: 'ask' as CheckoutBehavior,
    },
    {
      label: 'Always checkout',
      description:
        'Automatically checkout for full '
        + 'repo context',
      value: 'always' as CheckoutBehavior,
    },
    {
      label: 'Never checkout',
      description:
        'Review using Gerrit context only '
        + '(no local checkout)',
      value: 'never' as CheckoutBehavior,
    },
  ];

  const selected = await window.showQuickPick(
    items, {
    placeHolder:
      'How should AI Review handle '
      + 'change checkout?',
    title: 'Gerrit: Checkout Behavior',
  }
  );

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

  const url = getGerritURLFromReviewFile(
    gitReviewFile
  );
  if (!url) {
    return null;
  }

  const username =
    config.get('gerrit.auth.username') ?? '';
  const password =
    await GerritSecrets.getForUrlOrWorkspace(
      'password',
      url,
      workspace.workspaceFolders?.[0]?.uri
    );
  const cookie =
    await GerritSecrets.getForUrlOrWorkspace(
      'cookie',
      url,
      workspace.workspaceFolders?.[0]?.uri
    );
  const authPrefix = config.get(
    'gerrit.customAuthUrlPrefix',
    'a/'
  );

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
): Promise<void> {
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
  } else {
    log(
      'Could not auto-approve MCP server: '
      + stderr
    );
  }
}
