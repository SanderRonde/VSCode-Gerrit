import { ChangeState, ReviewPerson } from '../../../../state';
import { PeoplePicker } from './PeoplePicker';
import * as React from 'react';

interface ReviewerPickerProps {
	onChange: (reviewers: ReviewPerson[]) => void;
	state: ChangeState;
	reset: boolean;
}

export const ReviewerPicker: React.VFC<ReviewerPickerProps> = (props) => {
	const reviewers = React.useMemo(
		() => props.state.reviewers ?? [],
		[props.state.reviewers]
	);

	const pOnChange = props.onChange;
	const onChange = React.useCallback(
		(newReviewers: ReviewPerson[]) => {
			pOnChange(newReviewers);
		},
		[pOnChange]
	);

	React.useEffect(() => {
		pOnChange(reviewers);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.reset]);

	return (
		<PeoplePicker
			state={props.state}
			initialValue={reviewers}
			onChange={onChange}
			isCC={false}
			reset={props.reset}
		/>
	);
};
