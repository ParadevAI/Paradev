import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ChannelPerson } from "../ChannelMessageRow";
import { AddPeoplePicker } from "./components/AddPeoplePicker";
import { MemberRow } from "./components/MemberRow";

interface ChannelMembersDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	channelId: string;
	channelName: string;
	people: ChannelPerson[];
	currentUserId: string | null;
	canManage: boolean;
	canAdd: boolean;
}

export function ChannelMembersDialog({
	open,
	onOpenChange,
	channelId,
	channelName,
	people,
	currentUserId,
	canManage,
	canAdd,
}: ChannelMembersDialogProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const { data: members = [] } = cloudTrpc.channel.members.useQuery(
		{ channelId },
		{ enabled: open },
	);
	const options = {
		onSuccess: () => void utils.channel.invalidate(),
		onError: (error: unknown) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	};
	const addMembers = cloudTrpc.channel.addMembers.useMutation(options);
	const removeMember = cloudTrpc.channel.removeMember.useMutation(options);
	const setRole = cloudTrpc.channel.setRole.useMutation(options);
	const memberIds = new Set(members.map((member) => member.userId));
	const candidates = people.filter((person) => !memberIds.has(person.id));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Members of #{channelName}</Trans>
					</DialogTitle>
				</DialogHeader>
				{canAdd && (
					<AddPeoplePicker
						people={candidates}
						onAdd={(userId) =>
							addMembers.mutate({ channelId, userIds: [userId] })
						}
					/>
				)}
				<div className="-mx-2 flex max-h-96 flex-col overflow-y-auto">
					{members.map((member) => (
						<MemberRow
							key={member.userId}
							member={member}
							isSelf={member.userId === currentUserId}
							canManage={canManage}
							onSetRole={(role) =>
								setRole.mutate({ channelId, userId: member.userId, role })
							}
							onRemove={() =>
								removeMember.mutate({ channelId, userId: member.userId })
							}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
