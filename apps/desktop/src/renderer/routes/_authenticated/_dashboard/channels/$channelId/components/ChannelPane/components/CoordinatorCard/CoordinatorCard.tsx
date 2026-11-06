import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuDiamond } from "react-icons/lu";
import type { ChannelAgent } from "../../../../hooks/useChannelAgents";
import { SpeakerMark } from "../../../SpeakerMark";
import { StateDot } from "../../../StateDot";

interface CoordinatorCardProps {
	/** Where the coordinating session runs; null until one is started. */
	sessionIn: string | null;
	/** The chat agent it runs as. */
	agentLabel: string;
	agents: readonly ChannelAgent[];
	channelName: string;
	onClick?: () => void;
}

const NAMED_AT_MOST = 2;

const names = (
	agents: readonly ChannelAgent[],
	count: (n: number) => string,
): string =>
	agents.length > NAMED_AT_MOST
		? count(agents.length)
		: agents.map((agent) => agent.workspace.name).join(", ");

/** The channel's coordinator and what it is doing now, in one sentence. */
export function CoordinatorCard({
	sessionIn,
	agentLabel,
	agents,
	channelName,
	onClick,
}: CoordinatorCardProps) {
	const { t } = useLingui();
	const waiting = agents.filter((agent) => agent.state === "waiting");
	const working = agents.filter((agent) => agent.state === "working");
	const review = agents.filter((agent) => agent.state === "review");
	const idle = agents.filter((agent) => agent.state === "idle");
	const quiet = waiting.length === 0 && working.length === 0;
	const agentsCount = (n: number) => t({ message: `${n} agents` });
	const sentence = [
		waiting.length > 0 &&
			t({ message: `Needs you for ${names(waiting, agentsCount)}.` }),
		working.length > 0 &&
			t({ message: `Watching ${names(working, agentsCount)}.` }),
		quiet &&
			review.length > 0 &&
			t({ message: `${names(review, agentsCount)} ready for review.` }),
		quiet &&
			review.length === 0 &&
			idle.length > 0 &&
			t({ message: `${names(idle, agentsCount)} idle.` }),
	]
		.filter((part): part is string => typeof part === "string")
		.join(" ");
	const status =
		sentence ||
		(agents.length > 0
			? t({ message: "Nothing left in this channel." })
			: sessionIn === null
				? t({ message: "Not started yet." })
				: t({
						message: `Ready. Tag a workspace with #${channelName} to run it here.`,
					}));
	const busy = working.length > 0;

	const content = (
		<>
			<SpeakerMark name="" icon={<LuDiamond />} />
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex items-center gap-2">
					<span className="truncate text-[13px] leading-[18px] font-semibold">
						<Trans>Coordinator</Trans>
					</span>
					<span className="ml-auto flex min-w-0 shrink items-center gap-1.5 text-[11px] text-muted-foreground">
						<span className="truncate">{agentLabel}</span>
						<StateDot state={busy ? "working" : "idle"} />
					</span>
				</span>
				<span className="text-[12px] leading-4 text-muted-foreground">
					{status}
				</span>
			</span>
		</>
	);
	const classes = cn(
		"flex w-full items-start gap-2.5 rounded-[10px] border border-border bg-background px-2.5 py-2.5 text-left",
		onClick && "transition-colors hover:bg-fill-hover",
	);
	return onClick ? (
		<button type="button" onClick={onClick} className={classes}>
			{content}
		</button>
	) : (
		<div className={classes}>{content}</div>
	);
}
