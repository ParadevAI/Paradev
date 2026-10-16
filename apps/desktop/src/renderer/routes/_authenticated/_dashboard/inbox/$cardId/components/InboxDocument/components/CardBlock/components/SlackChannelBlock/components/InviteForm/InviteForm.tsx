import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { CardBlockViewProps } from "../../../../types";
import { ActionButton } from "../../../ActionButton";
import { SlackChannelLabel } from "../../../SlackChannelLabel";
import { nameList } from "../../utils/nameList";
import { ChannelFacts } from "../ChannelFacts";
import { InviteeList } from "../InviteeList";

/** Slack's "Add people to #channel" dialog. */
export function InviteForm({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.channel">) {
	const { t } = useLingui();
	const { channel } = view;
	const [invitees, setInvitees] = useState(view.invitees);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const adding = invitees.filter((invitee) => !invitee.alreadyMember);
	const who = nameList(
		adding.map((invitee) => invitee.person.name),
		(count) => t({ message: `${count} more` }),
	);
	const name = channel?.name ?? "";

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-3 px-4 py-3">
				{channel && (
					<ChannelFacts channel={channel}>
						<Trans>
							Add people to <SlackChannelLabel channel={channel} />
						</Trans>
					</ChannelFacts>
				)}
				<InviteeList
					invitees={invitees}
					directory={view.directory}
					onChange={setInvitees}
					readOnly={done}
					disabled={pending}
				/>
			</div>
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("dismiss")}
					>
						<Trans>Leave it</Trans>
					</ActionButton>
					<ActionButton
						action={action("invite")}
						pending={pending}
						disabled={adding.length === 0}
						confirmText={t({ message: `Add ${who} to #${name}?` })}
						onClick={() =>
							channel &&
							onAct("invite", {
								channel: channel.id,
								users: adding.map((invitee) => invitee.person.id),
							})
						}
					>
						<Trans context="add people to a Slack channel">Add</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}
