import { ChangeState, ReviewPerson } from '../../../../state';
import { PeoplePicker } from './PeoplePicker';
import * as React from 'react';

interface ReviewerPickerProps {
	onChange: (reviewers: ReviewPerson[]) => void;
	state: ChangeState;
}

export const ReviewerPicker: React.VFC<ReviewerPickerProps> = (props) => {
	const reviewers = React.useMemo(
		() => props.state.reviewers ?? [],
		[props.state.reviewers]
	);

	const onChange = React.useCallback(
		(newReviewers: ReviewPerson[]) => {
			props.onChange(newReviewers);
		},
		[props]
	);

	React.useEffect(() => {
		props.onChange(reviewers);
	}, [props, reviewers]);

	return (
		<PeoplePicker
			state={props.state}
			initialValue={reviewers}
			onChange={onChange}
			isCC={false}
		/>
	);
};
