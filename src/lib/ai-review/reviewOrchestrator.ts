import {
	window,
	workspace,
	Uri,
	Selection,
	Position,
	ProgressLocation,
	ExtensionContext,
	commands as vscodeCommands,
} from 'vscode';
import { FileTreeView } from '../../views/activityBar/changes/changeTreeView/fileTreeView';
import { ChangeTreeView } from '../../views/activityBar/changes/changeTreeView';
import { showCommentsOverview } from '../../views/commentsOverview';
import { getGerritURLFromReviewFile } from '../credentials/enterCredentials';
import { getGitReviewFileCached } from '../credentials/gitReviewFile';
import { GerritSecrets } from '../credentials/secrets';
import { getAPI } from '../gerrit/gerritAPI';
import { GerritAPIWith } from '../gerrit/gerritAPI/api';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { gitFetchAndCheckoutChange } from '../git/git';
import { quickCheckout } from '../git/quick-checkout';
import { writeMcpConfig, GerritCredentials } from '../mcp/mcpManager';
import { Repository } from '../../types/vscode-extension-git';
import { log, getOutputChannel, showOutputChannel } from '../util/log';
import { getConfiguration } from '../vscode/config';
import { writePromptFile } from './promptBuilder';
import { getDefaultModel } from './modelSelector';
import {
  runPreflight,
  AgentCommand,
} from './preflight';
import { spawn } from 'child_process';
import * as fs from 'fs';

type CheckoutBehavior = 'ask' | 'always' | 'never';

const SEPARATOR = '\u2500'.repeat(60);

export async function runAIReview(
	changeNumber: string,
	gerritRepo: Repository,
	extensionContext: ExtensionContext,
	changeTreeView?: ChangeTreeView
): Promise<void> {
	await window.withProgress(
		{
			location: ProgressLocation.Notification,
			title: 'Gerrit AI Review',
			cancellable: true,
		},
		async (progress, token) => {
			try {
				await doReview(
					changeNumber,
					gerritRepo,
					extensionContext,
					progress,
					token,
					changeTreeView
				);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				log('AI Review failed: ' + msg);
				void window.showErrorMessage('AI Review failed: ' + msg);
			}
		}
	);
}

async function doReview(
	changeNumber: string,
	gerritRepo: Repository,
	extensionContext: ExtensionContext,
	progress: {
		report: (v: { message?: string; increment?: number }) => void;
	},
	token: { isCancellationRequested: boolean },
	changeTreeView?: ChangeTreeView
): Promise<void> {
  progress.report({
    message: 'Preparing review...',
    increment: 5,
  });

  const shouldCheckout =
    await resolveCheckoutDecision(token);
  if (token.isCancellationRequested) {
    return;
  }

  if (shouldCheckout) {
    progress.report({
      message: 'Checking out change...',
      increment: 10,
    });

    if (changeTreeView) {
      await quickCheckout(
        gerritRepo, changeTreeView
      );
    } else {
      await gitFetchAndCheckoutChange(
        changeNumber,
        'latest',
        'origin',
        gerritRepo.rootUri.fsPath
      );
    }
  }

  progress.report({
    message: 'Configuring review environment...',
    increment: 10,
  });

  const credentials = await extractCredentials(
    gerritRepo
  );
  if (!credentials) {
    throw new Error(
      'Could not extract Gerrit credentials. '
      + 'Please configure them via "Gerrit: '
      + 'Enter Credentials".'
    );
  }

  const mcpOk = await writeMcpConfig(
    extensionContext.extensionPath,
    credentials
  );
  if (!mcpOk) {
    throw new Error(
      'Failed to write MCP configuration.'
    );
  }

  progress.report({
    message: 'Checking prerequisites...',
    increment: 5,
  });

  const preflight = await runPreflight();
  if (!preflight.ok || !preflight.agent) {
    const action = await window.showErrorMessage(
      (preflight.error
        ?? 'AI Review prerequisites not met.')
      + ' Run "Enable AI Review" to configure.',
      'Enable AI Review'
    );
    if (action === 'Enable AI Review') {
      await vscodeCommands.executeCommand(
        'gerrit.enableAiReview'
      );
    }
    return;
  }

  progress.report({
    message: 'Preparing review prompt...',
    increment: 5,
  });

  const promptFile = writePromptFile(
    changeNumber, shouldCheckout
  );

  progress.report({
    message:
      'Review in progress \u2014 see Output '
      + 'panel for live details',
    increment: 10,
  });

  try {
    await invokeCursorAgent(
      preflight.agent,
      changeNumber, promptFile, progress, token
    );
  } finally {
    cleanupTempFile(promptFile);
  }

  if (token.isCancellationRequested) {
    return;
  }

  progress.report({
    message: 'Done!',
    increment: 60,
  });

  await showCompletionActions(
    changeNumber, gerritRepo
  );
}

// ── Credentials ─────────────────────────────────────

async function extractCredentials(
	gerritRepo: Repository
): Promise<GerritCredentials | null> {
	const config = getConfiguration();
	const gitReviewFile = await getGitReviewFileCached(gerritRepo);

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

// ── Cursor agent invocation ─────────────────────────

async function invokeCursorAgent(
  agent: AgentCommand,
  changeNumber: string,
  promptFile: string,
  progress: {
    report: (v: {
      message?: string;
      increment?: number;
    }) => void;
  },
  token: { isCancellationRequested: boolean }
): Promise<void> {
  const model = getDefaultModel();
  const prompt =
    `Read and follow ${promptFile}`;
  const args = [
    ...agent.baseArgs,
    '--print',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    '--approve-mcps',
    '--trust',
    '--force',
  ];
  if (model) {
    args.push('--model', model);
  }

  const cwd =
    workspace.workspaceFolders?.[0]?.uri.fsPath;

  const oc = getOutputChannel();
  if (oc) {
    oc.clear();
    showOutputChannel();
    oc.appendLine('=== Gerrit AI Review ===');
    oc.appendLine('');
    oc.appendLine(`Change: ${changeNumber}`);
    oc.appendLine(
      `Model: ${model || '(auto)'}`
    );
    oc.appendLine('');
    oc.appendLine(SEPARATOR);
    oc.appendLine('');
  }

  log(
    `Invoking ${agent.cmd} agent (stream-json)`
  );

  const TIMEOUT_MS = 5 * 60 * 1000;
  const startTime = Date.now();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (
      fn: typeof resolve | typeof reject,
      val?: unknown
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      (fn as (v?: unknown) => void)(val);
    };

    const proc = spawn(agent.cmd, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    if (proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    if (oc) {
      oc.appendLine(
        `PID: ${proc.pid ?? 'unknown'}`
      );
      oc.appendLine('');
    }

    const timer = setTimeout(() => {
      log('Agent timed out after 5 minutes');
      if (oc) {
        oc.appendLine('');
        oc.appendLine(SEPARATOR);
        oc.appendLine(
          '[Timed out after 5 minutes]'
        );
      }
      proc.kill();
      settle(resolve);
    }, TIMEOUT_MS);

    let lastStatus = '';
    let buffer = '';

    proc.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        processStreamEvent(
          trimmed, oc, progress,
          lastStatus,
          (s) => { lastStatus = s; }
        );
      }
    });

    proc.stderr.on('data', (chunk: string) => {
      if (oc) {
        oc.appendLine(
          '[stderr] ' + chunk.trimEnd()
        );
      }
    });

    proc.on('error', (err) => {
      if (oc) {
        oc.appendLine('');
        oc.appendLine(SEPARATOR);
        oc.appendLine(
          '[ERROR] ' + err.message
        );
      }
      settle(reject, new Error(
        'Cursor Agent CLI failed to start: '
        + err.message
        + '. Install it via: '
        + 'curl https://cursor.com/install '
        + '-fsS | bash'
      ));
    });

    proc.on('exit', (code) => {
      if (buffer.trim()) {
        processStreamEvent(
          buffer.trim(), oc, progress,
          lastStatus,
          (s) => { lastStatus = s; }
        );
      }

      const elapsed = Math.round(
        (Date.now() - startTime) / 1000
      );
      if (oc) {
        oc.appendLine('');
        oc.appendLine(SEPARATOR);
        oc.appendLine(
          `[Completed in ${elapsed}s]`
        );
      }
      if (code === 0 || code === null) {
        log('Cursor Agent completed');
        settle(resolve);
      } else {
        settle(reject, new Error(
          'Cursor Agent exited with code '
          + String(code)
        ));
      }
    });

    if (token.isCancellationRequested) {
      proc.kill();
    }
  });
}

interface StreamEvent {
	type?: string;
	subtype?: string;
	model?: string;
	message?: {
		role?: string;
		content?: Array<{
			type?: string;
			text?: string;
		}>;
	};
	result?: string;
	duration_ms?: number;
	is_error?: boolean;
}

function processStreamEvent(
	jsonLine: string,
	oc: ReturnType<typeof getOutputChannel>,
	progress: {
		report: (v: { message?: string }) => void;
	},
	lastStatus: string,
	setStatus: (s: string) => void
): void {
	let evt: StreamEvent;
	try {
		evt = JSON.parse(jsonLine) as StreamEvent;
	} catch {
		if (oc) {
			oc.appendLine(jsonLine);
		}
		return;
	}

	switch (evt.type) {
		case 'system':
			if (evt.subtype === 'init' && oc) {
				if (evt.model) {
					oc.appendLine(`Agent model: ${evt.model}`);
				}
				oc.appendLine('');
				progress.report({
					message:
						'Agent started. Look at output panel (Gerrit) for live ' +
						'details.',
				});
			}
			break;

		case 'assistant': {
			const text = evt.message?.content?.[0]?.text;
			if (text && oc) {
				oc.append(text);
			}
			const status = extractStatusFromText(text || '');
			if (status && status !== lastStatus) {
				setStatus(status);
				progress.report({
					message: status,
				});
			}
			break;
		}

		case 'tool_call':
		case 'tool_result': {
			const text = evt.message?.content?.[0]?.text;
			if (text && oc) {
				oc.appendLine(`[tool] ${text.substring(0, 200)}`);
			}
			break;
		}

		case 'result':
			if (oc) {
				oc.appendLine('');
				if (evt.duration_ms) {
					const secs = Math.round(evt.duration_ms / 1000);
					oc.appendLine(`Agent finished (${secs}s)`);
				}
			}
			progress.report({
				message: 'Agent finished',
			});
			break;

		default:
			if (oc) {
				oc.appendLine(jsonLine);
			}
	}
}

function extractStatusFromText(text: string): string {
	if (!text || text.length < 5) {
		return '';
	}

	if (text.includes('gerrit_get_change')) {
		return 'Fetching change metadata...';
	}
	if (text.includes('gerrit_get_changed_files')) {
		return 'Fetching changed files...';
	}
	if (text.includes('gerrit_get_file_content')) {
		return 'Reading file contents...';
	}
	if (text.includes('gerrit_get_comments')) {
		return 'Reading comments...';
	}
	if (text.includes('gerrit_post_draft_comment')) {
		return 'Posting review comment...';
	}
	if (text.includes('gerrit_reply_to_comment')) {
		return 'Posting reply...';
	}

	return '';
}

// ── Post-review: browse drafts ──────────────────────

interface DraftItem {
	filePath: string;
	line?: number;
	message: string;
	changeNumber: string;
}

async function fetchDrafts(changeNumber: string): Promise<DraftItem[]> {
	const api = await getAPI();
	if (!api) {
		return [];
	}

	try {
		const draftsSub = api.getDraftComments(changeNumber);
		const draftsMap = await draftsSub.getValue();
		const items: DraftItem[] = [];

		for (const [filePath, comments] of draftsMap) {
			for (const c of comments) {
				items.push({
					filePath,
					line: c.line,
					message: c.message ?? '',
					changeNumber,
				});
			}
		}

		return items;
	} catch (e) {
		log('Failed to fetch drafts: ' + String(e));
		return [];
	}
}

async function browseDrafts(
	drafts: DraftItem[],
	gerritRepo: Repository,
	changeNumber: string
): Promise<void> {
	// Resolve the change once and warm ALL caches
	// (change, comments, drafts) before the loop
	// so every navigateToDraft is instant.
	const change = await GerritChange.getChangeOnce(changeNumber, [
		GerritAPIWith.CURRENT_REVISION,
		GerritAPIWith.CURRENT_FILES,
	]);
	if (change) {
		await Promise.all([
			GerritChange.getAllComments(change.changeID).then((s) =>
				s.getValue()
			),
			GerritChange.getAllComments(change.change_id)
				.then((s) => s.getValue())
				.catch(() => {}),
			GerritChange.getChangeOnce(change.change_id, [
				GerritAPIWith.CURRENT_REVISION,
				GerritAPIWith.CURRENT_FILES,
			]).catch(() => {}),
		]);
	}

	let idx = 0;
	while (idx >= 0 && idx < drafts.length) {
		const draft = drafts[idx];
		const total = drafts.length;
		const num = idx + 1;

		await navigateToDraft(draft, gerritRepo);

		const loc =
			draft.filePath === '/PATCHSET_LEVEL'
				? 'Patchset level'
				: draft.line
					? `${draft.filePath}:${draft.line}`
					: draft.filePath;
		const header = `[${num}/${total}] ${loc}`;

		const actions: string[] = [];
		if (idx > 0) {
			actions.push('Previous');
		}
		if (idx < total - 1) {
			actions.push('Next');
		}
		actions.push('Done');

		const pick = await window.showInformationMessage(header, ...actions);

		if (pick === 'Next') {
			idx++;
		} else if (pick === 'Previous') {
			idx--;
		} else {
			break;
		}
	}
}

async function navigateToDraft(
	draft: DraftItem,
	gerritRepo: Repository
): Promise<void> {
  if (draft.filePath === '/PATCHSET_LEVEL') {
    void window.showInformationMessage(
      'Patchset comment: ' + draft.message
    );
    return;
  }

  try {
    const change = await GerritChange.getChangeOnce(
      draft.changeNumber,
      [
        GerritAPIWith.CURRENT_REVISION,
        GerritAPIWith.CURRENT_FILES,
      ]
    );
    if (!change) {
      throw new Error('Change not found');
    }

    const revision =
      await change.getCurrentRevision();
    if (!revision) {
      throw new Error('Revision not found');
    }

    const filesMap = await (
      await revision.files(null)
    ).getValue();
    const file = filesMap?.[draft.filePath];

    if (file) {
      const diffCmd =
        await FileTreeView.createDiffCommand(
          gerritRepo, file, null
        );
      if (diffCmd?.arguments) {
        await vscodeCommands.executeCommand(
          diffCmd.command,
          ...(diffCmd.arguments as unknown[])
        );
        if (draft.line) {
          await new Promise((r) =>
            setTimeout(r, 300)
          );
          void vscodeCommands.executeCommand(
            'revealLine',
            {
              lineNumber: draft.line - 1,
              at: 'center',
            }
          );
        }
        return;
      }
    }

    await openFileFallback(
      draft, gerritRepo
    );
  } catch {
    await openFileFallback(
      draft, gerritRepo
    );
  }
}

async function openFileFallback(
	draft: DraftItem,
	gerritRepo: Repository
): Promise<void> {
	const fileUri = Uri.joinPath(gerritRepo.rootUri, draft.filePath);
	try {
		const doc = await workspace.openTextDocument(fileUri);
		const line = Math.max(0, (draft.line ?? 1) - 1);
		const pos = new Position(line, 0);
		const editor = await window.showTextDocument(doc, {
			selection: new Selection(pos, pos),
		});
		void vscodeCommands.executeCommand('revealLine', {
			lineNumber: editor.selection.active.line,
			at: 'center',
		});
	} catch {
		void window.showInformationMessage(
			`${draft.filePath}:${draft.line ?? ''}` + ` \u2014 ${draft.message}`
		);
	}
}

async function showCompletionActions(
	changeNumber: string,
	gerritRepo: Repository
): Promise<void> {
	const drafts = await fetchDrafts(changeNumber);
	const count = drafts.length;

	const msg =
		count > 0
			? `AI Review complete: ${count} draft ` + 'comment(s) posted.'
			: 'AI Review complete: no issues found.';

	const actions: string[] = [];
	if (count > 0) {
		actions.push('Comments Overview');
	}
	actions.push('Open in Gerrit');

	const result = await window.showInformationMessage(msg, ...actions);

	if (result === 'Comments Overview') {
		// Warm the comments cache under the full
		// changeID key so updatePanel can skip the
		// API call.
		const change = await GerritChange.getChangeOnce(changeNumber, [
			GerritAPIWith.ALL_REVISIONS,
			GerritAPIWith.ALL_FILES,
		]);
		if (change) {
			const sub = await GerritChange.getAllComments(change.changeID);
			await sub.getValue(true);
		}

		await showCommentsOverview(changeNumber, gerritRepo);
	} else if (result === 'Open in Gerrit') {
		await openChangeInBrowser(changeNumber);
	}
}

async function openChangeInBrowser(changeNumber: string): Promise<void> {
	try {
		const api = await getAPI();
		if (!api) {
			return;
		}
		const { GerritChange } =
			await import('../gerrit/gerritAPI/gerritChange');
		const change = await GerritChange.getChangeOnce(changeNumber);
		if (!change) {
			return;
		}
		const url = api.getPublicUrl(`c/${change.project}/+/${change.number}`);
		if (url) {
			const { env } = await import('vscode');
			void env.openExternal(Uri.parse(url));
		}
	} catch {
		// ignore navigation errors
	}
}

// ── Helpers ─────────────────────────────────────────

function cleanupTempFile(filePath: string): void {
	try {
		fs.unlinkSync(filePath);
		log('Cleaned up temp file: ' + filePath);
	} catch {
		// ignore cleanup errors
	}
}

async function resolveCheckoutDecision(token: {
	isCancellationRequested: boolean;
}): Promise<boolean> {
	const config = getConfiguration();
	const behavior = (config.get('gerrit.aiReview.checkoutBehavior') ??
		'ask') as CheckoutBehavior;

	if (behavior === 'always') {
		return true;
	}
	if (behavior === 'never') {
		return false;
	}

	const items = [
		{
			label: 'Yes',
			description: 'Checkout for full repo context ' + '(recommended)',
			value: 'yes',
		},
		{
			label: 'No',
			description: 'Review with Gerrit context only',
			value: 'no',
		},
	];

	const selected = await window.showQuickPick(items, {
		placeHolder: 'Checkout change before AI review?',
		title:
			'Checkout gives Cursor full repo ' + 'context for better reviews',
	});

	if (!selected || token.isCancellationRequested) {
		return false;
	}

	return selected.value === 'yes';
}
