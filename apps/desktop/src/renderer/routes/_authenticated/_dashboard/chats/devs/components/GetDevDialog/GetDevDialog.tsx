import { Trans, useLingui } from "@lingui/react/macro";
import type { ChatState, RegistryCard } from "@superset/chats-core";
import type { InstallTarget } from "@superset/chats-sync";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuUser } from "react-icons/lu";
import { listingFace } from "renderer/routes/_authenticated/_dashboard/chats/utils/listingFace";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { ChatFace } from "../../../components/ChatFace";
import {
	defaultChoice,
	type GetChoice,
	getChoices,
	MAX_ADDED,
} from "../../utils/getChoices";

const PARADEV = "paradev";

interface GetDevDialogProps {
	state: ChatState;
	card: RegistryCard;
	/** The group the directory was opened for: offered first. */
	fromGroupId?: string;
	onOpenChange: (open: boolean) => void;
	/** Resolves to the chat to open, or null when it was not made. */
	onGet: (
		target: InstallTarget,
		name: string,
		paradevAccess: boolean,
	) => Promise<string | null>;
	onGot: (chatId: string) => void;
}

/** Getting a ready-made Dev: its name, where it goes, and whether it may act in Paradev. */
export function GetDevDialog({
	state,
	card,
	fromGroupId,
	onOpenChange,
	onGet,
	onGot,
}: GetDevDialogProps) {
	const { t } = useLingui();
	const choices = getChoices(card, state, fromGroupId);
	const [name, setName] = useState(card.name);
	const [picked, setPicked] = useState(() =>
		defaultChoice(choices, fromGroupId),
	);
	const usesParadev =
		card.needs.apps.includes(PARADEV) || card.needs.optional.includes(PARADEV);
	const [paradevAccess, setParadevAccess] = useState(
		card.needs.apps.includes(PARADEV),
	);
	const [isBusy, setBusy] = useState(false);
	const choice = choices.find((candidate) => candidate.key === picked);
	const detailOf = (candidate: GetChoice) =>
		candidate.unavailable === "in-group"
			? t({ message: "Already in this group" })
			: candidate.unavailable === "group-full"
				? t({ message: `Already has ${MAX_ADDED} added Devs` })
				: candidate.unavailable === "owned"
					? t({ message: "You already have it" })
					: candidate.chat
						? t({ message: "Everyone there can ask it" })
						: t({ message: "A Dev of your own, with its 1:1" });
	const get = async () => {
		if (!choice || isBusy || !name.trim()) return;
		setBusy(true);
		const chatId = await onGet(
			choice.target,
			name.trim(),
			choice.target.kind === "you" && paradevAccess,
		);
		setBusy(false);
		if (!chatId) return;
		onOpenChange(false);
		onGot(chatId);
	};
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<FaceAvatar face={listingFace(card.slug)} size={24} />
						{card.name}
					</DialogTitle>
					<DialogDescription>{card.summary}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						void get();
					}}
				>
					<Input
						autoFocus
						value={name}
						maxLength={60}
						placeholder={t({ message: "Name" })}
						onChange={(event) => setName(event.target.value)}
					/>
					<div
						role="radiogroup"
						aria-label={t({ message: "Where it goes" })}
						className="flex max-h-56 flex-col gap-1 overflow-y-auto"
					>
						{choices.map((candidate) => (
							// biome-ignore lint/a11y/useSemanticElements: a row with a face and two lines, not a bare radio input
							<button
								key={candidate.key}
								type="button"
								role="radio"
								aria-checked={candidate.key === picked}
								disabled={candidate.unavailable !== null}
								onClick={() => setPicked(candidate.key)}
								className={cn(
									"flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left disabled:opacity-50",
									candidate.key === picked
										? "bg-fill-selected"
										: "hover:bg-fill-hover",
								)}
							>
								{candidate.chat ? (
									<ChatFace chat={candidate.chat} size={28} />
								) : (
									<span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/10">
										<LuUser className="size-3.5" />
									</span>
								)}
								<span className="flex min-w-0 flex-col">
									<span className="truncate font-medium text-sm">
										{candidate.title ?? <Trans>Just me</Trans>}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{detailOf(candidate)}
									</span>
								</span>
							</button>
						))}
					</div>
					{usesParadev && choice?.target.kind === "you" && (
						<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
							<span className="flex flex-col gap-1">
								<label
									htmlFor="get-dev-paradev-access"
									className="font-medium text-sm"
								>
									<Trans>Let it act in Paradev as you</Trans>
								</label>
								<span className="text-muted-foreground text-xs">
									<Trans>
										It can start workspaces and coding agents with your access,
										also when someone else asks it in a group.
									</Trans>
								</span>
							</span>
							<Switch
								id="get-dev-paradev-access"
								checked={paradevAccess}
								onCheckedChange={setParadevAccess}
							/>
						</div>
					)}
					<Button type="submit" disabled={!choice || isBusy || !name.trim()}>
						{choice?.chat ? (
							<Trans>Add to {choice.title}</Trans>
						) : (
							<Trans>Get {name.trim() || card.name}</Trans>
						)}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
