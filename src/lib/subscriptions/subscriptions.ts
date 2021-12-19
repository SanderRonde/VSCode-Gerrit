import {
	GerritComment,
	GerritDraftComment,
} from '../gerrit/gerritAPI/gerritComment';
import { GenericChangeSubscriptionsManager } from './changeSubscription';
import { ChangesSubscriptionsManager } from './changesSubscriptions';
import { APISubSubscriptionManagerBase } from './baseSubscriptions';
import { FilesSubscriptionsManager } from './filesSubscription';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { Disposable } from 'vscode';

export interface Subscribable<V> extends Disposable {
	subscribe: (
		handler: WeakRef<(value: V) => void>,
		options?: {
			once?: boolean;
			onInitial?: boolean;
		}
	) => void;
	subscribeOnce: (
		handler: WeakRef<(value: V) => void>,
		options?: {
			onInitial?: boolean;
		}
	) => void;
	getValue: (forceUpdate?: boolean) => Promise<V>;
	unsubscribe: () => void;
	disposable: Disposable;
	invalidate: () => Promise<void>;
	mapSubscription: <O>(mapper: (input: V) => O) => Subscribable<O>;
}

export class APISubscriptionManager {
	public static changeSubscriptions =
		new GenericChangeSubscriptionsManager<GerritChange | null>();
	public static commentsSubscriptions = new GenericChangeSubscriptionsManager<
		Map<string, GerritComment[]>
	>();
	public static draftCommentsSubscriptions =
		new GenericChangeSubscriptionsManager<
			Map<string, GerritDraftComment[]>
		>();
	public static changesSubscriptions = new ChangesSubscriptionsManager();
	public static filesSubscriptions = new FilesSubscriptionsManager();
	public static readonly NO_OP = (): void => {};
	public static getNullSubscription(): Subscribable<null> {
		const subscription: Omit<Subscribable<null>, 'mapSubscription'> = {
			subscribe: APISubscriptionManager.NO_OP,
			subscribeOnce: APISubscriptionManager.NO_OP,
			getValue: () => Promise.resolve(null),
			unsubscribe: APISubscriptionManager.NO_OP,
			disposable: { dispose: APISubscriptionManager.NO_OP },
			dispose: APISubscriptionManager.NO_OP,
			invalidate: () => Promise.resolve(),
		};
		return {
			...subscription,
			mapSubscription:
				APISubSubscriptionManagerBase.createMapper(subscription),
		};
	}
}
