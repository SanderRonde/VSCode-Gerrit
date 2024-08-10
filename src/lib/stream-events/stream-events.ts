import {
	Disposable,
	env,
	StatusBarAlignment,
	StatusBarItem,
	Uri,
	window,
} from 'vscode';
import {
	DEFAULT_GIT_REVIEW_FILE,
	getGitReviewFile,
} from '../credentials/gitReviewFile';
import { storageGet, StorageScope, storageSet } from '../vscode/storage';
import { APISubscriptionManager } from '../subscriptions/subscriptions';
import { GerritExtensionCommands } from '../../commands/command-names';
import { getContextProp, setContextProp } from '../vscode/context';
import { MATCH_ANY } from '../subscriptions/baseSubscriptions';
import { StreamEvent } from './stream-event-types';
import { GerritRepo } from '../gerrit/gerritRepo';
import { tryExecAsync } from '../git/gitCLI';
import { spawn } from 'child_process';
import { log } from '../util/log';

export async function testEnableStreamEvents(
	gerritRepo: GerritRepo
): Promise<boolean> {
	if (getContextProp('gerrit.streamEvents')) {
		// Test if it works first
		return canStreamEvents(gerritRepo);
	}

	// Check if we notified the user already
	if (await storageGet('streamEventsAsked', StorageScope.GLOBAL)) {
		// Already asked
		return false;
	}

	// Ask the user
	await storageSet('streamEventsAsked', true, StorageScope.GLOBAL);
	const ENABLE_OPTION = 'Enable';
	const MORE_INFO_OPTION = 'More info (in browser)';
	const answer = await window.showInformationMessage(
		'The Gerrit extension can listen for events through SSH. Do you want to enable this feature?',
		ENABLE_OPTION,
		MORE_INFO_OPTION
	);
	if (answer === ENABLE_OPTION) {
		await setContextProp('gerrit.streamEvents', true);
		return await canStreamEvents(gerritRepo);
	} else if (answer === MORE_INFO_OPTION) {
		await env.openExternal(
			Uri.parse(
				'https://gerrit-review.googlesource.com/Documentation/cmd-stream-events.html'
			)
		);
	}

	return false;
}

export async function canStreamEvents(
	gerritRepo: GerritRepo
): Promise<boolean> {
	const gitReviewFile = await getGitReviewFile(gerritRepo);
	if (!gitReviewFile) {
		void window.showErrorMessage(
			'Failed to find .gitreview file. This file is needed for stream events settings, please provide it'
		);
		return false;
	}

	const cmd = `ssh -p ${gitReviewFile.port ?? DEFAULT_GIT_REVIEW_FILE.port} ${
		gitReviewFile.host
	} gerrit stream-events`;
	const result = await tryExecAsync(cmd, gerritRepo.rootPath, {
		timeout: 5000,
		killSignal: 'SIGSEGV',
	});
	// Let's hope Gerrit doesn't get an actual segfault in it
	if (result.err && result.err.signal !== 'SIGSEGV') {
		const out = result.stdout + result.stderr;
		const DISABLE_ANSWER = 'Disable stream events';
		const RETRY_ANSWER = 'Retry';
		if (out.includes('stream events not permitted')) {
			const MORE_INFO_ANSWER = 'More info (in browser)';
			const answer = await window.showErrorMessage(
				'Stream events are not permitted for your user account. Please ask your administrator to give you the StreamEvents capability or disable stream events (can be re-enabled in settings)',
				MORE_INFO_ANSWER,
				RETRY_ANSWER,
				DISABLE_ANSWER
			);
			if (answer === MORE_INFO_ANSWER) {
				await env.openExternal(
					Uri.parse(
						'https://gerrit-review.googlesource.com/Documentation/access-control.html#capability_streamEvents'
					)
				);
			} else if (answer === DISABLE_ANSWER) {
				await setContextProp('gerrit.streamEvents', false);
			} else if (answer === RETRY_ANSWER) {
				return await canStreamEvents(gerritRepo);
			}
		} else {
			const answer = await window.showErrorMessage(
				'Got an error while trying to connect to the server, please check the log for details or disable stream events (can be re-enabled in settings)',
				RETRY_ANSWER,
				DISABLE_ANSWER
			);
			if (answer === DISABLE_ANSWER) {
				await setContextProp('gerrit.streamEvents', false);
			} else if (answer === RETRY_ANSWER) {
				return await canStreamEvents(gerritRepo);
			}
		}
		return false;
	}

	return true;
}

async function onChangeEvent(event: StreamEvent): Promise<void> {
	if (!('type' in event)) {
		return;
	}

	log('Stream event:', event.type);

	switch (event.type) {
		case 'change-abandoned':
		case 'change-deleted':
		case 'change-merged':
		case 'change-restored':
		case 'patchset-created':
		case 'wip-state-changed':
			await Promise.all([
				APISubscriptionManager.changesSubscriptions.invalidate(
					MATCH_ANY
				),
				APISubscriptionManager.changeSubscriptions.invalidate({
					changeID: event.change.id,
					field: MATCH_ANY,
					withValues: MATCH_ANY,
				}),
			]);
			return;
		case 'comment-added':
			await APISubscriptionManager.commentsSubscriptions.invalidate({
				changeID: event.change.id,
				field: MATCH_ANY,
				withValues: MATCH_ANY,
			});
			return;
	}
}

function getEventDescription(event: StreamEvent): string {
	switch (event.type) {
		case 'change-abandoned':
		case 'change-deleted':
		case 'change-merged':
		case 'change-restored':
		case 'patchset-created':
		case 'wip-state-changed':
		case 'assignee-changed':
		case 'comment-added':
		case 'hashtags-changed':
		case 'reviewer-added':
		case 'reviewer-deleted':
		case 'topic-changed':
		case 'vote-deleted':
			return `${event.type} - change: ${
				event.change.number ?? event.change.id
			}`;
		case 'project-created':
			return `${event.type} - project: ${event.projectName}@${event.projectHead}`;
		case 'dropped-out':
			return event.type;
		case 'ref-updated':
			return `${event.type} - ref: ${event.refUpdate.oldrev} -> ${event.refUpdate.newRev}`;
		default:
			return (event as { type: string }).type;
	}
}

let currentListener: Disposable | null = null;
let statusBar: StatusBarItem | null = null;
let statusBarIconTimeout: NodeJS.Timeout | null = null;
export async function listenForStreamEvents(
	gerritRepo: GerritRepo
): Promise<Disposable> {
	if (!statusBar) {
		statusBar = window.createStatusBarItem(StatusBarAlignment.Right, 0);
	}
	if (currentListener) {
		currentListener.dispose();
		currentListener = null;
	}

	const gitReviewFile = await getGitReviewFile(gerritRepo);
	if (!gitReviewFile) {
		void window.showErrorMessage(
			'Setting up stream-events listener failed because the .gitreview file was missing, please provide it'
		);
		statusBar.text = '$(warning) Gerrit';
		statusBar.tooltip =
			'Stream events failed to connect, .gitreview file missing. Click to retry';
		statusBar.command =
			GerritExtensionCommands.RETRY_LISTEN_FOR_STREAM_EVENTS;
		statusBar.show();
		return { dispose() {} };
	}

	const cmd = spawn('ssh', [
		'-p',
		gitReviewFile.port ?? DEFAULT_GIT_REVIEW_FILE.port,
		gitReviewFile.host,
		'gerrit',
		'stream-events',
	]);
	cmd.stdout.on('data', (data: string | Buffer) => {
		try {
			const parsed = JSON.parse(data.toString()) as StreamEvent;
			if (statusBarIconTimeout) {
				clearTimeout(statusBarIconTimeout);
			}
			if (statusBar) {
				statusBar.text = '$(cloud-download) Gerrit';
				statusBar.tooltip = `Got event: ${getEventDescription(parsed)}`;
				statusBarIconTimeout = setTimeout(() => {
					if (statusBar) {
						statusBar.text = '$(cloud) Gerrit';
						statusBar.tooltip =
							'Gerrit listening for stream events';
					}
				}, 5000);
			}
			void onChangeEvent(parsed);
		} catch (e) {
			log('Failure parsing stream-events data', data.toString());
		}
	});

	statusBar.text = '$(cloud) Gerrit';
	statusBar.tooltip = 'Gerrit listening for stream events';
	statusBar.command = undefined;
	statusBar.show();

	const onDisconnect = (): void => {
		if (statusBar) {
			statusBar.text = '$(warning) Gerrit';
			statusBar.tooltip = 'Stream events disconnected, click to retry';
			statusBar.command =
				GerritExtensionCommands.RETRY_LISTEN_FOR_STREAM_EVENTS;
			statusBar.show();
		}
		currentListener = null;
	};
	cmd.once('close', onDisconnect);
	cmd.once('disconnect', onDisconnect);
	cmd.once('error', onDisconnect);
	cmd.once('exit', onDisconnect);

	const disposable: Disposable = {
		dispose() {
			cmd.off('close', onDisconnect);
			cmd.off('disconnect', onDisconnect);
			cmd.off('error', onDisconnect);
			cmd.off('exit', onDisconnect);
			currentListener = null;
		},
	};

	currentListener = disposable;

	return disposable;
}

export async function startListeningForStreamEvents(
	gerritRepo: GerritRepo
): Promise<Disposable> {
	await listenForStreamEvents(gerritRepo);
	return {
		dispose() {
			if (currentListener) {
				currentListener.dispose();
				currentListener = null;
			}
			if (statusBar) {
				statusBar.dispose();
				statusBar = null;
			}
		},
	};
}
