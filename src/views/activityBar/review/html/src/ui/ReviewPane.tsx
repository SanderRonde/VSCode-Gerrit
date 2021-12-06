import { createStyle, useJoinedStyles } from '../lib/style';
import { ReviewerPicker } from './pickers/ReviewerPicker';
import { useCurrentChangeState } from '../lib/state';
import { CCPicker } from './pickers/CCPicker';
import { globalStyles } from '../lib/styles';
import { EmptyView } from './EmptyView';
import * as React from 'react';

export const ReviewPane: React.VFC = () => {
	const state = useCurrentChangeState();

	const headerStyles = useJoinedStyles(
		styles.header,
		globalStyles.horizontalCenter
	);

	if (!state) {
		return <EmptyView />;
	}

	return (
		<div>
			<div style={headerStyles}>{`Change #${state.number}`}</div>
			<div>
				<div>{'Reviewers:'}</div>
				<ReviewerPicker />
			</div>
			<div>
				<div>{'CC:'}</div>
				<CCPicker />
			</div>
		</div>
	);
};

const styles = createStyle({
	header: {
		fontSize: '1.5em',
		fontWeight: 'bold',
		marginTop: '20px',
	},
});
