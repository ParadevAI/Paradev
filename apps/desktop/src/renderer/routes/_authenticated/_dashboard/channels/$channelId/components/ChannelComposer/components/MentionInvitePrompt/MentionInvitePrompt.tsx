import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ChannelPerson } from "../../../ChannelMessageRow";

interface MentionInvitePromptProps {
	channelId: string;
	channelName: string;
	people: ChannelPerson[];
	onDone: () => void;
}

/** Slackbot's "they're not in this channel" prompt, shown only to the sender. */
export function MentionInvitePrompt({
	channelId,
	channelName,
	people,
	onDone,
}: MentionInvitePromptProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const addMembers = cloudTrpc.channel.addMembers.useMutation({
		onSuccess: () => {
			void utils.channel.invalidate();
			onDone();
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't add them to the channel" })),
			),
	});
	const names = people.map((person) => person.name).join(", ");

	return (
		<div className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
			<p className="text-xs text-muted-foreground">
				<Trans>Only visible to you</Trans>
			</p>
			<p className="mt-1">
				<Trans>
					You mentioned {names}, but they're not in #{channelName}. Add them to
					the channel?
				</Trans>
			</p>
			<div className="mt-2 flex gap-2">
				<Button
					size="sm"
					disabled={addMembers.isPending}
					onClick={() =>
						addMembers.mutate({
							channelId,
							actorIds: people.map((person) => person.id),
						})
					}
				>
					<Trans>Add them</Trans>
				</Button>
				<Button size="sm" variant="outline" onClick={onDone}>
					<Trans>Do nothing</Trans>
				</Button>
			</div>
		</div>
	);
}
