import { Trans, useLingui } from "@lingui/react/macro";
import { type Chat, type ChatState, myDevs } from "@superset/chats-core";
import { errorMessage } from "@superset/i18n/errors";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuPencil, LuX } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DevFace } from "renderer/routes/_authenticated/_dashboard/chats/components/DevFace";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { ChatFace } from "../../../components/ChatFace";
import { DevPluginIcons } from "../../../components/DevPluginIcons";
import { DevPluginsDialog } from "../../../components/DevPluginsDialog";
import { useChats } from "../../../hooks/useChats";
import { EditDevDialog } from "./components/EditDevDialog";
import { GroupSettings } from "./components/GroupSettings";

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
	const [editingId, setEditingId] = useState<string | null>(null);
	const [pluginsOfId, setPluginsOfId] = useState<string | null>(null);
	const chats = useChats();
	const navigate = useNavigate();
	const editing = editingId ? state.devs[editingId] : undefined;
	const pluginsOf = pluginsOfId ? state.devs[pluginsOfId] : undefined;
	const isGroup = chat.kind === "group";
	const addableDevs = isGroup
		? myDevs(state).filter((dev) => !chat.devIds.includes(dev.id))
		: [];
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
	const isOwner = chat.ownerIds.includes(state.meId);
	const remove = (userId: string) => {
		setAddingId(userId);
		apiTrpcClient.chats.removeMember
			.mutate({ groupId: chat.id, userId })
			.then(() => {
				if (userId === state.meId) void navigate({ to: "/chats" });
			})
			.catch((error: unknown) =>
				toast.error(
					errorMessage(
						error,
						userId === state.meId
							? t({ message: "Couldn't leave the group" })
							: t({ message: "Couldn't remove them from the group" }),
					),
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
							<DevFace devId={agent.id} size={28} />
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">{agent.name}</div>
								{agent.description && (
									<div className="truncate text-xs text-muted-foreground">
										{agent.description}
									</div>
								)}
							</div>
							{isGroup && agent.ownerId === state.meId && (
								<Button
									size="xs"
									variant="ghost"
									onClick={() =>
										chats?.actions.setDevInGroup(chat.id, agent.id, false)
									}
								>
									<Trans>Remove</Trans>
								</Button>
							)}
							{isGroup &&
								agent.kind === "added" &&
								(chat.devAddedBy?.[agent.id] === state.meId || isOwner) && (
									<Button
										size="xs"
										variant="ghost"
										onClick={() =>
											void chats?.actions.removeAddedDev(chat.id, agent.id)
										}
									>
										<Trans>Remove</Trans>
									</Button>
								)}
							{agent.descriptionText !== undefined && (
								<button
									type="button"
									aria-label={t({ message: `Edit ${agent.name}` })}
									onClick={() => setEditingId(agent.id)}
									className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
								>
									<LuPencil className="size-3.5" />
								</button>
							)}
						</div>
					))}
					{isGroup && (
						<Button
							size="xs"
							variant="outline"
							className="mt-1 self-start"
							onClick={() =>
								void navigate({
									to: "/chats/devs",
									search: { groupId: chat.id },
								})
							}
						>
							<Trans>Add a ready-made Dev</Trans>
						</Button>
					)}
				</section>
				{agents
					.filter((agent) => agent.plugins !== undefined)
					.map((agent) => {
						const used = [
							...(agent.paradevAccess ? ["paradev"] : []),
							...(agent.plugins ?? []),
						];
						return (
							<section key={agent.id} className="flex flex-col gap-1">
								<h3 className="px-1 pb-1 font-medium text-muted-foreground text-xs">
									{isGroup ? (
										<Trans>{agent.name}'s plugins</Trans>
									) : (
										<Trans>Plugins</Trans>
									)}
								</h3>
								<p className="px-1 pb-1 text-muted-foreground text-xs">
									{used.length === 0 ? (
										<Trans>
											None yet. Give it GitHub, Linear, Gmail or others to work
											with your accounts.
										</Trans>
									) : (
										<Trans>What it can use as you.</Trans>
									)}
								</p>
								<div className="flex items-center gap-2 px-1">
									<DevPluginIcons plugins={used} />
									<Button
										size="xs"
										variant="outline"
										onClick={() => setPluginsOfId(agent.id)}
									>
										{used.length === 0 ? (
											<Trans>Add plugins</Trans>
										) : (
											<Trans>Manage</Trans>
										)}
									</Button>
								</div>
							</section>
						);
					})}
				{addableDevs.length > 0 && (
					<section className="flex flex-col gap-1">
						<h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">
							<Trans>Add your Devs</Trans>
						</h3>
						<p className="px-1 pb-1 text-xs text-muted-foreground">
							<Trans>
								You can @ a Dev you add. Other people here reach it through the
								group's Dev.
							</Trans>
						</p>
						{addableDevs.map((dev) => (
							<div
								key={dev.id}
								className="flex items-center gap-2.5 rounded-lg px-1 py-1"
							>
								<DevFace devId={dev.id} size={28} />
								<span className="min-w-0 flex-1 truncate text-sm">
									{dev.name}
								</span>
								<Button
									size="xs"
									variant="outline"
									onClick={() =>
										chats?.actions.setDevInGroup(chat.id, dev.id, true)
									}
								>
									<Trans>Add</Trans>
								</Button>
							</div>
						))}
					</section>
				)}
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
							<span className="min-w-0 flex-1 truncate text-sm">
								{person.name}
							</span>
							{isGroup && isOwner && person.id !== state.meId && (
								<Button
									size="xs"
									variant="ghost"
									disabled={addingId === person.id}
									onClick={() => remove(person.id)}
								>
									<Trans>Remove</Trans>
								</Button>
							)}
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
				{isGroup && !isOwner && (
					<Button
						variant="ghost"
						className="justify-start text-destructive hover:text-destructive"
						disabled={addingId === state.meId}
						onClick={() => remove(state.meId)}
					>
						<Trans>Leave group</Trans>
					</Button>
				)}
				{isGroup && chats && isOwner && (
					<GroupSettings
						key={chat.id}
						title={chat.title}
						onRename={(next) => chats.actions.renameGroup(chat.id, next)}
						onDelete={async () => {
							const deleted = await chats.actions.deleteGroup(chat.id);
							if (deleted) void navigate({ to: "/chats" });
							return deleted;
						}}
					/>
				)}
			</div>
			{pluginsOf && chats && (
				<DevPluginsDialog
					key={pluginsOf.id}
					dev={pluginsOf}
					onOpenChange={(open) => {
						if (!open) setPluginsOfId(null);
					}}
					onSave={(patch) => chats.actions.updateDev(pluginsOf.id, patch)}
				/>
			)}
			{editing && chats && (
				<EditDevDialog
					key={editing.id}
					dev={editing}
					onOpenChange={(open) => {
						if (!open) setEditingId(null);
					}}
					onSave={(patch) => chats.actions.updateDev(editing.id, patch)}
					onDelete={
						editing.kind === "custom" && editing.ownerId === state.meId
							? async () => {
									const deleted = await chats.actions.deleteAgent(editing.id);
									if (deleted && chat.kind === "direct") {
										void navigate({ to: "/chats" });
									}
									return deleted;
								}
							: undefined
					}
				/>
			)}
		</aside>
	);
}
