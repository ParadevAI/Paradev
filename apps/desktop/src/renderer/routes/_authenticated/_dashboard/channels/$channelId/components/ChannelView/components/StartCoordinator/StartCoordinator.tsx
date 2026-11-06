import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useEffect, useRef, useState } from "react";
import { LuArrowUp, LuChevronDown, LuDiamond } from "react-icons/lu";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WHERE_FILTER_ANYWHERE } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

type ChannelSummary = RouterOutputs["channel"]["get"];
const MAX_CHOICES = 30;

interface StartCoordinatorProps {
	channel: ChannelSummary;
	/** Chat sessions are an experimental setting; without it there is nothing to start. */
	chatEnabled: boolean;
	/** The goal is what the channel is for; it is saved with the channel when it changed. */
	onStart: (workspaceId: string, prompt: string, goal: string) => void;
}

/**
 * The channel before it has a coordinator: pick which of your workspaces the
 * coordinating session runs in, say what the channel should get done, start.
 */
export function StartCoordinator({
	channel,
	chatEnabled,
	onStart,
}: StartCoordinatorProps) {
	const { t } = useLingui();
	const promptRef = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		promptRef.current?.focus();
	}, []);
	const { all } = useAccessibleV2Workspaces({
		whereFilter: WHERE_FILTER_ANYWHERE,
	});
	const { workspaces: hostRows } = useHostWorkspaces();
	// A tagged workspace is some channel's agent; the coordinator belongs in
	// one of the person's own, so those come first.
	const tagged = new Set(
		hostRows.filter((row) => row.tags?.length).map((row) => row.id),
	);
	const choices = all
		.filter(
			(workspace) =>
				workspace.hostType !== "cloud" && workspace.archivedAt === null,
		)
		.sort(
			(a, b) =>
				Number(tagged.has(a.id)) - Number(tagged.has(b.id)) ||
				(b.lastAgentEventAt ?? b.createdAt.getTime()) -
					(a.lastAgentEventAt ?? a.createdAt.getTime()),
		)
		.slice(0, MAX_CHOICES);
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);
	const [goal, setGoal] = useState(channel.description ?? "");
	const [prompt, setPrompt] = useState("");
	const chosen =
		choices.find((workspace) => workspace.id === workspaceId) ?? choices[0];
	const canStart = Boolean(chosen) && prompt.trim().length > 0 && chatEnabled;
	const submit = () => {
		if (!chosen || !canStart) return;
		onStart(chosen.id, prompt.trim(), goal.trim());
	};

	return (
		<div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6">
			<div className="flex w-full max-w-[560px] flex-col gap-5 py-10">
				<div className="flex flex-col gap-2">
					<span className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-background text-muted-foreground">
						<LuDiamond className="size-4" />
					</span>
					<h2 className="text-[17px] font-semibold">
						<Trans>Start the coordinator</Trans>
					</h2>
					<p className="text-[13px] leading-[19px] text-muted-foreground">
						<Trans>
							The coordinator is a chat session of your own. It splits the work
							of this channel into agents, one workspace each, and reports back
							here. Pick where it runs and tell it what #{channel.name} should
							get done.
						</Trans>
					</p>
					{!chatEnabled && (
						<p className="text-[13px] leading-[19px] text-foreground/80">
							<Trans>
								Turn on Chat in Settings → Experimental first; the coordinator
								is a chat session.
							</Trans>
						</p>
					)}
				</div>
				<div className="flex flex-col gap-2 rounded-[12px] border border-border bg-background p-3">
					<label className="flex items-center gap-2 border-b border-border pb-2 text-[13px]">
						<span className="shrink-0 text-[11px] font-semibold tracking-[0.075em] text-muted-foreground uppercase">
							<Trans>Goal</Trans>
						</span>
						<input
							value={goal}
							onChange={(event) => setGoal(event.target.value)}
							placeholder={t({
								message: "What this channel is for, in a sentence",
							})}
							className="min-w-0 flex-1 bg-transparent text-[13px] leading-[18px] outline-none placeholder:text-muted-foreground"
						/>
					</label>
					<textarea
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								submit();
							}
						}}
						rows={3}
						ref={promptRef}
						placeholder={t({
							message: "What should the coordinator do first?",
						})}
						className="field-sizing-content max-h-[240px] min-h-[72px] w-full resize-none bg-transparent text-[14px] leading-[22px] outline-none placeholder:text-muted-foreground"
					/>
					<div className="flex items-center justify-between gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex h-7 max-w-[320px] items-center gap-1.5 rounded-md bg-fill-hover px-2 text-[12px] font-medium transition-colors hover:bg-fill-selected"
								>
									<span className="truncate">
										{chosen ? (
											chosen.name
										) : (
											<Trans>No workspace on this machine</Trans>
										)}
									</span>
									<LuChevronDown className="size-3 shrink-0 text-muted-foreground" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-80">
								{choices.map((workspace) => (
									<DropdownMenuItem
										key={workspace.id}
										onSelect={() => setWorkspaceId(workspace.id)}
									>
										<span className="flex min-w-0 flex-col">
											<span className="truncate text-[13px]">
												{workspace.name}
											</span>
											<span className="truncate text-[11px] text-muted-foreground">
												{workspace.projectName ?? workspace.branch}
											</span>
										</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<button
							type="button"
							disabled={!canStart}
							onClick={submit}
							aria-label={t({ message: "Start" })}
							className="flex size-7 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-40"
						>
							<LuArrowUp className="size-3.5" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
