import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuSearch } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useShareDirectory } from "renderer/routes/_authenticated/_dashboard/hooks/useShareDirectory";
import { CandidateRow } from "./components/CandidateRow";
import { MemberRow } from "./components/MemberRow";

type ChannelSummary = RouterOutputs["channel"]["get"];

interface MembersTabProps {
	channel: ChannelSummary;
	currentUserId: string | null;
}

const matches = (person: { name: string; email: string }, needle: string) =>
	!needle ||
	person.name.toLowerCase().includes(needle) ||
	person.email.toLowerCase().includes(needle);

export function MembersTab({ channel, currentUserId }: MembersTabProps) {
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const { directory } = useShareDirectory();
	const utils = cloudTrpc.useUtils();
	const { data: members = [] } = cloudTrpc.channel.members.useQuery({
		channelId: channel.id,
	});
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

	const needle = query.trim().toLowerCase();
	const memberIds = new Set(members.map((member) => member.userId));
	const canAdd = channel.membership !== null || channel.canManage;
	const shownMembers = members.filter((member) => matches(member, needle));
	const candidates = canAdd
		? directory.members
				.filter((person) => !memberIds.has(person.userId))
				.filter((person) => matches(person, needle))
				.sort((a, b) => a.name.localeCompare(b.name))
		: [];

	return (
		<div className="flex flex-col gap-3">
			<div className="relative">
				<LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t({ message: "Find people" })}
					className="h-9 bg-background pl-9"
				/>
			</div>
			<div className="space-y-1">
				{shownMembers.map((member) => (
					<MemberRow
						key={member.userId}
						member={member}
						isSelf={member.userId === currentUserId}
						canManage={channel.canManage}
						onSetRole={(role) =>
							setRole.mutate({
								channelId: channel.id,
								userId: member.userId,
								role,
							})
						}
						onRemove={() =>
							removeMember.mutate({
								channelId: channel.id,
								userId: member.userId,
							})
						}
					/>
				))}
			</div>
			{candidates.length > 0 && (
				<div className="space-y-1.5">
					<p className="text-xs text-muted-foreground">
						<Trans>Not in channel</Trans>
					</p>
					<div className="space-y-1">
						{candidates.map((person) => (
							<CandidateRow
								key={person.userId}
								person={person}
								isSelf={person.userId === currentUserId}
								isAdding={
									addMembers.isPending &&
									addMembers.variables?.userIds.includes(person.userId) === true
								}
								onAdd={() =>
									addMembers.mutate({
										channelId: channel.id,
										userIds: [person.userId],
									})
								}
							/>
						))}
					</div>
				</div>
			)}
			{needle && !shownMembers.length && !candidates.length && (
				<p className="text-sm text-muted-foreground">
					<Trans>No one matches</Trans>
				</p>
			)}
		</div>
	);
}
