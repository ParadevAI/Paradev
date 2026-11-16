import { Trans, useLingui } from "@lingui/react/macro";
import type { Chat, ChatState } from "@superset/chats-core";
import { errorMessage } from "@superset/i18n/errors";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuX } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { ChatFace } from "../../../components/ChatFace";

interface ChatDetailsPanelProps {
	state: ChatState;
	chat: Chat;
	title: string;
	onClose: () => void;
}

/** What a chat is, beside its conversation: its face and name, its Devs and its people. */
export function ChatDetailsPanel({
	state,
	chat,
	title,
	onClose,
}: ChatDetailsPanelProps) {
	const { t } = useLingui();
	const agents = chat.devIds.flatMap((id) => {
		const agent = state.devs[id];
		return agent ? [agent] : [];
	});
	const people = chat.memberIds.flatMap((id) => {
		const person = state.members[id];
		return person ? [person] : [];
	});
	const organization = useOrganizationPeople();
	const [addingId, setAddingId] = useState<string | null>(null);
	const candidates =
		chat.kind === "group"
			? organization.people.filter(
					(person) => !chat.memberIds.includes(person.id),
				)
			: [];
	const add = (userId: string) => {
		setAddingId(userId);
		apiTrpcClient.chats.addMember
			.mutate({ groupId: chat.id, userId })
			.catch((error: unknown) =>
				toast.error(
					errorMessage(error, t({ message: "Couldn't add them to the group" })),
				),
			)
			.finally(() => setAddingId(null));
	};
	return (
		<aside className="flex h-full w-80 shrink-0 flex-col border-l border-border">
			<div className="flex h-12 shrink-0 items-center justify-end px-3">
				<button
					type="button"
					aria-label={t({ message: "Close" })}
					onClick={onClose}
					className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuX className="size-4" />
				</button>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-8">
				<div className="flex flex-col items-center gap-2 text-center">
					<ChatFace chat={chat} size={60} />
					<h2 className="max-w-full truncate text-[22px] leading-tight font-semibold tracking-[-0.02em]">
						{title}
					</h2>
					{chat.kind === "direct" && agents[0]?.description && (
						<p className="text-sm text-muted-foreground">
							{agents[0].description}
						</p>
					)}
				</div>
				<section className="flex flex-col gap-1">
					<h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">
						<Trans>Devs</Trans>
					</h3>
					{agents.map((agent) => (
						<div
							key={agent.id}
							className="flex items-center gap-2.5 rounded-lg px-1 py-1"
						>
							<FaceAvatar seed={agent.id} size={28} />
							<div className="min-w-0">
								<div className="truncate text-sm font-medium">{agent.name}</div>
								{agent.description && (
									<div className="truncate text-xs text-muted-foreground">
										{agent.description}
									</div>
								)}
							</div>
						</div>
					))}
				</section>
				<section className="flex flex-col gap-1">
					<h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">
						<Trans>People</Trans>
					</h3>
					{people.map((person) => (
						<div
							key={person.id}
							className="flex items-center gap-2.5 rounded-lg px-1 py-1"
						>
							<Avatar size="sm" fullName={person.name} image={null} />
							<span className="truncate text-sm">{person.name}</span>
						</div>
					))}
				</section>
				{candidates.length > 0 && (
					<section className="flex flex-col gap-1">
						<h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">
							<Trans>Add people</Trans>
						</h3>
						{candidates.map((person) => (
							<div
								key={person.id}
								className="flex items-center gap-2.5 rounded-lg px-1 py-1"
							>
								<Avatar size="sm" fullName={person.name} image={person.image} />
								<span className="min-w-0 flex-1 truncate text-sm">
									{person.name}
								</span>
								<Button
									size="xs"
									variant="outline"
									disabled={addingId === person.id}
									onClick={() => add(person.id)}
								>
									<Trans>Add</Trans>
								</Button>
							</div>
						))}
					</section>
				)}
			</div>
		</aside>
	);
}
