import { createStyle } from './style';

export const globalStyles = createStyle({
	horizontalCenter: {
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'center',
	},
	verticalCenter: {
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'center',
	},
});
