import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import { AgentIcon } from "renderer/components/AgentIcon";
import {
	CODING_AGENT_NAMES,
	type CodingAgentId,
	CodingAgentSetup,
} from "renderer/routes/_authenticated/components/CodingAgentSetup";

interface AgentMissingCardProps {
	agent: CodingAgentId;
	/** The raw error, kept behind Details. */
	detail?: string | undefined;
	/** Installed elsewhere, from Settings say, while this chat waited. */
	installed?: boolean;
	otherAgents: Array<{ presetId: string; label: string }>;
	onUseAgent: (presetId: string) => void;
	onRetry: () => void;
}

/** Shown in place of a chat that stopped because its agent isn't installed. */
export function AgentMissingCard({
	agent,
	detail,
	installed = false,
	otherAgents,
	onUseAgent,
	onRetry,
}: AgentMissingCardProps) {
	const name = CODING_AGENT_NAMES[agent];
	const [picked, setPhase] = useState<
		"missing" | "installing" | "installed" | null
	>(null);
	const phase = picked ?? (installed ? "installed" : "missing");

	return (
		<div className="flex h-full w-full items-center justify-center p-8">
			<div className="flex w-full max-w-md flex-col gap-4 rounded-lg border bg-muted/30 p-5">
				<div className="flex items-start gap-3">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background">
						<AgentIcon presetId={agent} className="size-4" />
					</span>
					<div className="min-w-0 flex-1">
						<p className="font-medium text-foreground text-sm">
							{phase === "installed" ? (
								<Trans>{name} is installed</Trans>
							) : (
								<Trans>{name} isn't installed yet</Trans>
							)}
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{phase === "installed" ? (
								<Trans>Try again to start this chat.</Trans>
							) : (
								<Trans>
									This chat needs {name}. Paradev can install it for you. It
									takes about a minute, and nothing else on your Mac changes.
								</Trans>
							)}
						</p>
					</div>
				</div>
				{phase === "installing" && (
					<CodingAgentSetup
						agent={agent}
						step="install"
						onInstalled={() => setPhase("installed")}
						onSignedIn={() => {}}
						onCancel={() => setPhase("missing")}
					/>
				)}
				{phase !== "installing" && (
					<div className="flex items-center justify-end gap-2">
						{phase === "missing" && otherAgents.length > 0 && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button size="sm" variant="ghost">
										<Trans>Use another agent</Trans>
										<LuChevronDown className="size-3" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{otherAgents.map((other) => (
										<DropdownMenuItem
											key={other.presetId}
											onSelect={() => onUseAgent(other.presetId)}
										>
											<AgentIcon
												presetId={other.presetId}
												className="size-3.5"
											/>
											{other.label}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{phase === "missing" ? (
							<Button size="sm" onClick={() => setPhase("installing")}>
								<Trans>Install</Trans>
							</Button>
						) : (
							<Button size="sm" onClick={onRetry}>
								<Trans>Try again</Trans>
							</Button>
						)}
					</div>
				)}
				{detail && (
					<details className="text-muted-foreground text-xs">
						<summary className="cursor-pointer select-none">
							<Trans>Details</Trans>
						</summary>
						<p className="mt-1.5 select-text font-mono text-[11px] text-muted-foreground/70">
							{detail}
						</p>
					</details>
				)}
			</div>
		</div>
	);
}
