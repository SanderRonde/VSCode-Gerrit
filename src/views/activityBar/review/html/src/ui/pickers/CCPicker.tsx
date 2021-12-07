import { ChangeState, ReviewPerson } from '../../../../state';
import { PeoplePicker } from './PeoplePicker';
import * as React from 'react';

interface CCPickerProps {
	state: ChangeState;
	onChange: (cc: ReviewPerson[]) => void;
}

export const CCPicker: React.VFC<CCPickerProps> = (props) => {
	const cc = React.useMemo(() => props.state.cc ?? [], [props.state.cc]);

	const onChange = React.useCallback(
		(cc: ReviewPerson[]) => {
			props.onChange(cc);
		},
		[props]
	);

	React.useEffect(() => {
		props.onChange(cc);
	}, [cc, props]);

	return (
		<PeoplePicker
			state={props.state}
			initialValue={cc}
			onChange={onChange}
			isCC={true}
		/>
	);
};
