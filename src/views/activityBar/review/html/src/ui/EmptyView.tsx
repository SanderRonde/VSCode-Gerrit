import { globalStyles } from '../lib/styles';
import { createStyle } from '../lib/style';
import * as React from 'react';

export const EmptyView: React.VFC = () => {
	return (
		<div style={styles.emptyMessage}>
			<div style={globalStyles.horizontalCenter}>
				<div style={globalStyles.verticalCenter}>
					<div style={styles.header}>{'No change selected'}</div>
				</div>
			</div>
		</div>
	);
};

const styles = createStyle({
	header: {
		fontSize: '1.5em',
		fontWeight: 'bold',
	},
	emptyMessage: {
		marginTop: '50px',
	},
});
