import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuSearch, LuX } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useShareDirectory } from "renderer/routes/_authenticated/_dashboard/hooks/useShareDirectory";
import { CandidateRow } from "./components/CandidateRow";
import { DevMemberRow } from "./components/DevMemberRow";
import { MemberRow } from "./components/MemberRow";

type ChannelSummary = RouterOutputs["channel"]["get"];

interface MembersTabProps {
	channel: ChannelSummary;
	currentUserId: string | null;
}

const matches = (person: { name: string; email?: string }, needle: string) =>
	!needle ||
	person.name.toLowerCase().includes(needle) ||
	(person.email?.toLowerCase().includes(needle) ?? false);

export function MembersTab({ channel, currentUserId }: MembersTabProps) {
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const { directory } = useShareDirectory();
	const utils = cloudTrpc.useUtils();
	const { data: members = [] } = cloudTrpc.channel.members.useQuery({
		channelId: channel.id,
	});
	const { data: devs = [] } = cloudTrpc.channel.devMembers.useQuery({
		channelId: channel.id,
	});
	const { data: orgDevs = [] } = cloudTrpc.agent.list.useQuery({
		organizationId: channel.organizationId,
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
	const removeDev = cloudTrpc.channel.removeDev.useMutation(options);
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
	const devIds = new Set(devs.map((dev) => dev.agentId));
	const shownDevs = devs.filter((dev) => matches(dev, needle));
	const candidateDevs = canAdd
		? orgDevs
				.filter((dev) => !devIds.has(dev.id) && dev.pausedAt === null)
				.filter((dev) => matches(dev, needle))
		: [];

	return (
		<div className="flex flex-col gap-3">
			<div className="relative">
				<LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t({ message: "Find people and Devs" })}
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
				{shownDevs.map(({ agentId, name, avatar }) => (
					<DevMemberRow
						key={agentId}
						name={name}
						avatar={avatar}
						trailing={
							channel.canManage && (
								<Button
									size="icon-xs"
									variant="ghost"
									aria-label={t({ message: `Remove ${name}` })}
									onClick={() =>
										removeDev.mutate({
											channelId: channel.id,
											agentId: agentId,
										})
									}
								>
									<LuX className="size-3.5" />
								</Button>
							)
						}
					/>
				))}
			</div>
			{(candidates.length > 0 || candidateDevs.length > 0) && (
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
									addMembers.variables?.userIds?.includes(person.userId) ===
										true
								}
								onAdd={() =>
									addMembers.mutate({
										channelId: channel.id,
										userIds: [person.userId],
									})
								}
							/>
						))}
						{candidateDevs.map((dev) => (
							<DevMemberRow
								key={dev.id}
								name={dev.name}
								avatar={dev.avatar}
								trailing={
									<Button
										size="xs"
										variant="outline"
										disabled={
											addMembers.isPending &&
											addMembers.variables?.agentIds?.includes(dev.id) === true
										}
										onClick={() =>
											addMembers.mutate({
												channelId: channel.id,
												agentIds: [dev.id],
											})
										}
									>
										<Trans>Add</Trans>
									</Button>
								}
							/>
						))}
					</div>
				</div>
			)}
			{needle &&
				!shownMembers.length &&
				!candidates.length &&
				!shownDevs.length &&
				!candidateDevs.length && (
					<p className="text-sm text-muted-foreground">
						<Trans>No one matches</Trans>
					</p>
				)}
		</div>
	);
}
