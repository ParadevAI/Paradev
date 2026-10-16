import { Trans, useLingui } from "@lingui/react/macro";
import { LuUserPlus } from "react-icons/lu";
import type { SlackInviteeView, SlackPersonView } from "../../../../types";
import { SlackInviteeRow } from "../../../SlackInviteeRow";
import { SlackPicker } from "../../../SlackPicker";

interface InviteeListProps {
	invitees: SlackInviteeView[];
	/** Everyone the reader can add. */
	directory: readonly SlackPersonView[];
	onChange: (invitees: SlackInviteeView[]) => void;
	/** History: the people, with no way to change them. */
	readOnly: boolean;
	disabled: boolean;
}

/** The people a channel card adds, each removable, and Slack's "Add people" picker under them. */
export function InviteeList({
	invitees,
	directory,
	onChange,
	readOnly,
	disabled,
}: InviteeListProps) {
	const { t } = useLingui();
	const listed = new Set(invitees.map((invitee) => invitee.person.id));
	return (
		<div className="flex flex-col gap-0.5">
			{invitees.map((invitee) => (
				<SlackInviteeRow
					key={invitee.person.id}
					invitee={invitee}
					disabled={disabled}
					onRemove={
						readOnly
							? undefined
							: () =>
									onChange(
										invitees.filter(
											(each) => each.person.id !== invitee.person.id,
										),
									)
					}
				/>
			))}
			{!readOnly && (
				<SlackPicker
					label={t({ message: "Find people" })}
					people={directory.filter((person) => !listed.has(person.id))}
					onPickPerson={(person) =>
						onChange([
							...invitees,
							{ person, guest: false, alreadyMember: false },
						])
					}
				>
					<button
						type="button"
						disabled={disabled}
						className="flex h-8 w-fit items-center gap-2 rounded-md px-1.5 text-[13px] font-medium text-foreground hover:bg-fill-hover disabled:opacity-50"
					>
						<LuUserPlus className="size-3.5 text-muted-foreground" />
						<Trans>Add people</Trans>
					</button>
				</SlackPicker>
			)}
		</div>
	);
}
