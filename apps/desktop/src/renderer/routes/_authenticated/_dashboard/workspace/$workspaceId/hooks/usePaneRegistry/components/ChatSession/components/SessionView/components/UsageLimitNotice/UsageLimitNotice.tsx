import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { UsageLimit, UsageLimitAction } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { Clock, Gauge, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PILL_TRIGGER_CLASS } from "renderer/routes/_authenticated/components/AgentComposer/constants";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
import {
	type AccountSwitch,
	UsageAccountMenu,
} from "../../../UsageAccountMenu";

const TICK_MS = 30_000;
const CLOSE_TICK_MS = 5_000;
const COUNTDOWN_TICK_MS = 1_000;
const ARMED_CLASS =
	"bg-amber-400/10 text-amber-400 hover:bg-amber-400/15 hover:text-amber-300";
const CLOSE_MS = 2 * 60_000;

/** The provider's window names, as a reader knows them. */
const TITLES: Record<string, ReturnType<typeof msg>> = {
	five_hour: msg({ message: "5-hour limit reached" }),
	seven_day: msg({ message: "Weekly limit reached" }),
	seven_day_opus: msg({ message: "Weekly Opus limit reached" }),
	seven_day_sonnet: msg({ message: "Weekly Sonnet limit reached" }),
	seven_day_overage_included: msg({ message: "Extra usage limit reached" }),
	overage: msg({ message: "Extra usage limit reached" }),
};

/**
 * The provider refused the last turn for the account's usage. One line says
 * which limit, for which model, on which account, and when it reopens; the
 * controls offer to continue now or at the reset, to move the chat to
 * another login the host knows, or to look at usage.
 */
export function UsageLimitNotice({
	accountSwitch,
	limit,
	modelLabel,
	onRespond,
}: {
	limit: UsageLimit;
	onRespond: (action: UsageLimitAction) => void;
	/** The model's name as the agent lists it; the id when it does not. */
	modelLabel?: string | undefined;
	/** Set for an agent whose logins the host can switch between. */
	accountSwitch?: AccountSwitch | undefined;
}) {
	const { i18n, t } = useLingui();
	const [now, setNow] = useState(() => Date.now());
	const resetsAtMs = limit.resetsAtMs;
	const waiting = resetsAtMs !== undefined && resetsAtMs > now;
	const resumesAtMs = limit.resumeAtReset ? limit.resumesAtMs : undefined;
	const resuming = !waiting && resumesAtMs !== undefined && resumesAtMs > now;
	// Near the reset the countdown is in minutes, so the tick keeps up.
	const close = waiting && resetsAtMs - now < CLOSE_MS;
	useEffect(() => {
		if (!waiting && !resuming) return;
		const timer = window.setInterval(
			() => setNow(Date.now()),
			resuming ? COUNTDOWN_TICK_MS : close ? CLOSE_TICK_MS : TICK_MS,
		);
		return () => window.clearInterval(timer);
	}, [waiting, resuming, close]);
	const resumeSeconds =
		resuming && resumesAtMs !== undefined
			? Math.ceil((resumesAtMs - now) / 1000)
			: 0;

	const title = limit.window ? TITLES[limit.window] : undefined;
	const detail = [
		modelLabel,
		resetsAtMs === undefined
			? undefined
			: waiting
				? formatResetLabel(new Date(resetsAtMs), new Date(now))
				: t({ message: "Limit has reset" }),
	]
		.filter((part): part is string => Boolean(part))
		.join(" · ");

	return (
		<div
			className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-2 pl-3"
			data-usage-limit
		>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-400">
				<Gauge className="size-4" />
			</span>
			<div className="min-w-48 flex-1 font-sans">
				{/* Only the title is live: the countdown below ticks every second. */}
				<output className="block truncate font-medium text-[13px] text-foreground">
					{title ? i18n._(title) : <Trans>Usage limit reached</Trans>}
				</output>
				{detail && (
					<div className="truncate text-[12px] text-muted-foreground">
						{detail}
					</div>
				)}
			</div>
			<div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-0.5">
				{accountSwitch && <UsageAccountMenu {...accountSwitch} />}
				{resuming ? (
					<button
						className={cn(PILL_TRIGGER_CLASS, ARMED_CLASS, "tabular-nums")}
						onClick={() => onRespond("cancel_resume_at_reset")}
						title={t({ message: "Cancel the automatic resume" })}
						type="button"
					>
						<Clock className="size-3.5" />
						{t({ message: `Resuming in ${resumeSeconds}s` })}
					</button>
				) : !waiting ? (
					<button
						className={PILL_TRIGGER_CLASS}
						onClick={() => onRespond("resume")}
						type="button"
					>
						<Play className="size-3.5" />
						<Trans>Resume</Trans>
					</button>
				) : limit.resumeAtReset ? (
					<button
						className={cn(PILL_TRIGGER_CLASS, ARMED_CLASS)}
						onClick={() => onRespond("cancel_resume_at_reset")}
						title={t({ message: "Cancel the automatic resume" })}
						type="button"
					>
						<Clock className="size-3.5" />
						<Trans>Resuming at reset</Trans>
					</button>
				) : (
					<button
						className={PILL_TRIGGER_CLASS}
						onClick={() => onRespond("resume_at_reset")}
						title={t({ message: "Continue this chat once the limit resets" })}
						type="button"
					>
						<Clock className="size-3.5" />
						<Trans>Resume at reset</Trans>
					</button>
				)}
				<button
					aria-label={t({ message: "Dismiss the usage limit notice" })}
					className={cn(PILL_TRIGGER_CLASS, "px-1.5")}
					onClick={() => onRespond("dismiss")}
					type="button"
				>
					<X className="size-3.5" />
				</button>
			</div>
		</div>
	);
}
