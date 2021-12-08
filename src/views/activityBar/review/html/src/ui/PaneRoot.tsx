import type { ReviewWebviewMessage } from '../../../messaging';
import { messageListeners } from '../lib/messageHandler';
import { createStyles } from '../lib/style';
import { ReviewPane } from './ReviewPane';
import * as React from 'react';

export const Root: React.VFC = () => {
	const [initialized, setInitialized] = React.useState<boolean>(false);

	React.useEffect(() => {
		const listener = (msg: ReviewWebviewMessage) => {
			if (msg.type === 'initialize') {
				setInitialized(true);
			}
		};
		messageListeners.add(listener);
		return () => {
			messageListeners.delete(listener);
		};
	});

	if (!initialized) {
		return (
			<div style={styles.horizontalCenter}>
				<div style={styles.verticalCenter}>
					<vscode-progress-ring />
				</div>
			</div>
		);
	}

	return <ReviewPane />;
};

const styles = createStyles({
	verticalCenter: {
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'center',
	},
	horizontalCenter: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'center',
		height: '100%',
	},
});
