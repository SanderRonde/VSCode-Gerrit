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
import { Disposable } from 'vscode';

interface SubscriptionOptions {
	onInitial?: boolean;
	onSame?: boolean;
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
	unsubscribe: () => void;
	disposable: Disposable;
	invalidate: () => Promise<void>;
	mapSubscription: <O>(mapper: (input: V) => O) => Subscribable<O>;
	fetchOnce: () => Promise<V>;
}

export class APISubscriptionManager {
	public static changeSubscriptions =
		GenericChangeSubscriptionsManager<GerritChange | null>;
	public static commentsSubscriptions = GenericChangeSubscriptionsManager<
		Map<string, GerritComment[]>
	>;
	public static draftCommentsSubscriptions =
		GenericChangeSubscriptionsManager<Map<string, GerritDraftComment[]>>;
	public static changesSubscriptions = ChangesSubscriptionsManager;
	public static filesSubscriptions = FilesSubscriptionsManager;
	public static quickCheckoutSubscriptions =
		QuickCheckoutSubscriptionsManager;
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
			fetchOnce: () => Promise.resolve(null),
		};
		return {
			...subscription,
			mapSubscription:
				APISubSubscriptionManagerBase.createMapper(subscription),
		};
	}

	public changeSubscriptions =
		new GenericChangeSubscriptionsManager<GerritChange | null>();
	public commentsSubscriptions = new GenericChangeSubscriptionsManager<
		Map<string, GerritComment[]>
	>();
	public draftCommentsSubscriptions = new GenericChangeSubscriptionsManager<
		Map<string, GerritDraftComment[]>
	>();
	public changesSubscriptions = new ChangesSubscriptionsManager();
	public filesSubscriptions = new FilesSubscriptionsManager();
	public quickCheckoutSubscriptions = new QuickCheckoutSubscriptionsManager();
}
