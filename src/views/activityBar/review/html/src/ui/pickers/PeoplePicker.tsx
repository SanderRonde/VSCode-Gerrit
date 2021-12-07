import { ChangeState, ReviewPerson } from '../../../../state';
import { sendMessage } from '../../lib/messageHandler';
import { Picker } from '../Picker';
import * as React from 'react';

export interface PeoplePickerProps {
	initialValue: ReviewPerson[];
	onChange: (values: ReviewPerson[]) => void;
	state: ChangeState;
	isCC: boolean;
}

export const PeoplePicker: React.VFC<PeoplePickerProps> = (props) => {
	const [value, setValue] = React.useState<ReviewPerson[]>(
		props.initialValue
	);

	const onSearch = React.useCallback(
		(query: string) => {
			sendMessage({
				type: 'getPeople',
				body: {
					query,
					changeID: props.state.changeID,
					isCC: props.isCC,
				},
			});
		},
		[props.isCC, props.state.changeID]
	);

	const onChange = React.useCallback(
		(values: unknown[]) => {
			const people = values as ReviewPerson[];
			props.onChange(people);
			setValue(people);
		},
		[props]
	);

	const people = React.useMemo(() => {
		const suggestedPeople =
			(props.isCC
				? props.state.suggestedCC
				: props.state.suggestedReviewers) ?? [];

		for (let i = 0; i < value.length; i++) {
			const selectedPerson = value[i];
			if (
				!suggestedPeople.find((arrItem) => {
					return arrItem.id === selectedPerson.id;
				})
			) {
				// Add to the list, get rid of something else if we're at the cap
				if (suggestedPeople.length >= 10) {
					suggestedPeople.splice(suggestedPeople.length - 1, 1);
				}
				suggestedPeople.unshift(selectedPerson);
			}
		}
		return suggestedPeople;
	}, [
		props.isCC,
		props.state.suggestedCC,
		props.state.suggestedReviewers,
		value,
	]);

	return (
		<Picker<ReviewPerson>
			getLabel={(person: unknown) => (person as ReviewPerson).name}
			getShort={(person: unknown) => (person as ReviewPerson).shortName}
			onChange={onChange}
			items={people}
			value={value}
			onSearch={onSearch}
			itemIsSame={(personA, personB) => {
				return personA.id === personB.id;
			}}
		/>
	);
};
