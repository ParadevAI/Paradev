import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentMessage } from "@superset/chat/protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Check, Copy, Split } from "lucide-react";
import { useCallback } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { ChatForkTarget } from "../../../../types";
import { MessageTime } from "../MessageTime";

const COPIED_MS = 1500;

export function ReplyFooter({
	canForkToWorktree = true,
	className,
	item,
	onFork,
	text,
}: {
	item: AgentMessage;
	text: string;
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	canForkToWorktree?: boolean;
	className?: string;
}) {
	const { t } = useLingui();
	const { copied, copyToClipboard } = useCopyToClipboard(COPIED_MS);

	const copy = useCallback(() => {
		copyToClipboard(text).catch((error: unknown) => {
			console.error("[chat] copy failed", error);
		});
	}, [copyToClipboard, text]);

	return (
		<div
			className={cn(
				"flex items-center gap-2 text-muted-foreground/60 opacity-0 transition-opacity focus-within:opacity-100",
				className,
			)}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						aria-label={t({ message: "Copy message" })}
						className={cn(
							"rounded p-1 transition-colors hover:bg-secondary hover:text-foreground",
							copied && "text-foreground",
						)}
						onClick={copy}
						type="button"
					>
						{copied ? (
							<Check className="size-3.5" />
						) : (
							<Copy className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent>
					<Trans>Copy message</Trans>
				</TooltipContent>
			</Tooltip>
			{onFork && (
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger
								aria-label={t({ message: "Branch this conversation" })}
								className="rounded p-1 transition-colors hover:bg-secondary hover:text-foreground"
							>
								<Split className="size-3.5" />
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent>
							<Trans>Branch this conversation</Trans>
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="start" className="w-72">
						<DropdownMenuItem
							className="flex-col items-start gap-0.5"
							onSelect={() => onFork("workspace")}
						>
							<span className="text-xs">
								<Trans>Branch in this workspace</Trans>
							</span>
							<span className="text-[11px] text-muted-foreground">
								<Trans>
									The agent copies the conversation; the branch opens in a new
									tab
								</Trans>
							</span>
						</DropdownMenuItem>
						{canForkToWorktree && (
							<DropdownMenuItem
								className="flex-col items-start gap-0.5"
								onSelect={() => onFork("worktree")}
							>
								<span className="text-xs">
									<Trans>Branch in a new worktree</Trans>
								</span>
								<span className="text-[11px] text-muted-foreground">
									<Trans>
										A new workspace off this branch, with the conversation
										handed to a fresh agent
									</Trans>
								</span>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{item.model && (
				<span className="max-w-48 truncate text-[11px]" title={item.model}>
					{item.model}
				</span>
			)}
			<MessageTime atMs={item.completedAtMs ?? item.startedAtMs} />
		</div>
	);
}
