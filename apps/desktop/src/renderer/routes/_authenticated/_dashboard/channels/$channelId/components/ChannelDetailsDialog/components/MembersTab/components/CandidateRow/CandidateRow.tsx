import { Trans } from "@lingui/react/macro";
import type { SharePerson } from "@superset/shared/sharing";
import { Button } from "@superset/ui/button";
import { PersonRow } from "../PersonRow";

interface CandidateRowProps {
	person: SharePerson;
	isSelf: boolean;
	isAdding: boolean;
	onAdd: () => void;
}

export function CandidateRow({
	person,
	isSelf,
	isAdding,
	onAdd,
}: CandidateRowProps) {
	return (
		<PersonRow
			userId={person.userId}
			name={person.name}
			email={person.email}
			image={person.image}
			isSelf={isSelf}
			trailing={
				<Button size="xs" variant="outline" disabled={isAdding} onClick={onAdd}>
					<Trans>Add</Trans>
				</Button>
			}
		/>
	);
}
