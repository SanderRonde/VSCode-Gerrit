import {
	GerritComment,
	GerritDraftComment,
} from '../gerrit/gerritAPI/gerritComment';
import { QuickCheckoutSubscriptionsManager } from './quickCheckoutSubscriptions';
import { GenericChangeSubscriptionsManager } from './changeSubscription';
import { ChangesSubscriptionsManager } from './changesSubscriptions';
import { APISubSubscriptionManagerBase } from './baseSubscriptions';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { FilesSubscriptionsManager } from './filesSubscription';
import { GerritFile } from '../gerrit/gerritAPI/gerritFile';
import { Disposable } from 'vscode';

interface SubscriptionOptions {
	onInitial?: boolean;
}

export interface Subscribable<V> extends Disposable {
	subscribe: (
		handler: WeakRef<(value: V) => void>,
		options?: {
			once?: boolean;
		} & SubscriptionOptions
	) => void;
	subscribeOnce: (
		handler: WeakRef<(value: V) => void>,
		options?: SubscriptionOptions
	) => void;
	getValue: (forceUpdate?: boolean) => Promise<V>;
	tryGetValue: () => Promise<
		| { isSet: true; value: V; lastGetAt: number }
		| { isSet: false; value: null }
	>;
	unsubscribe: () => void;
	disposable: Disposable;
	invalidate: () => Promise<void>;
	mapSubscription: <O>(mapper: (input: V) => O) => Subscribable<O>;
	fetchOnce: () => Promise<V>;
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
	public static filesSubscriptions = new FilesSubscriptionsManager<
		Record<string, GerritFile>
	>();
	public static fileReviewStatusSubscriptions = new FilesSubscriptionsManager<
		Record<string, boolean>
	>();
	public static quickCheckoutSubscriptions =
		new QuickCheckoutSubscriptionsManager();
	public static readonly NO_OP = (): void => {};
	public static getNullSubscription(): Subscribable<null> {
		const subscription: Omit<Subscribable<null>, 'mapSubscription'> = {
			subscribe: APISubscriptionManager.NO_OP,
			subscribeOnce: APISubscriptionManager.NO_OP,
			getValue: () => Promise.resolve(null),
			tryGetValue: () =>
				Promise.resolve({
					isSet: true,
					value: null,
					lastGetAt: Date.now(),
				}),
			unsubscribe: APISubscriptionManager.NO_OP,
			disposable: { dispose: APISubscriptionManager.NO_OP },
			dispose: APISubscriptionManager.NO_OP,
			invalidate: () => Promise.resolve(),
			fetchOnce: () => Promise.resolve(null),
		};
		return {
			...subscription,
			mapSubscription:
				APISubSubscriptionManagerBase.createMapper(subscription),
		};
	}
}
