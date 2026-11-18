import { Trans, useLingui } from "@lingui/react/macro";
import { Kbd } from "@superset/ui/kbd";
import { ArrowLeft, Bot, Square } from "lucide-react";
import type { KeyboardEvent, Ref } from "react";
import { PILL_TRIGGER_CLASS } from "renderer/routes/_authenticated/components/AgentComposer/constants";
import type { ComposerTarget } from "../../../Composer";

export function SubagentNotice({
	target,
	parentTitle,
	agentLabel,
	onBack,
	backRef,
}: {
	target: ComposerTarget;
	parentTitle: string | null;
	agentLabel?: string;
	onBack: () => void;
	backRef?: Ref<HTMLButtonElement>;
}) {
	const { t } = useLingui();
	const { name, blockedBy } = target;
	const onStop = blockedBy ? target.onStop : undefined;
	const detail =
		blockedBy === "agent"
			? agentLabel
				? t({
						message: `${agentLabel} doesn't let you message its subagents. Go back to message the main agent.`,
					})
				: t({
						message:
							"This agent doesn't let you message its subagents. Go back to message the main agent.",
					})
			: blockedBy === "ended"
				? t({
						message: `${name} can't take messages now. Go back to message the main agent.`,
					})
				: blockedBy === "stopped"
					? t({
							message: `${name} stopped and can't take messages. Go back to message the main agent.`,
						})
					: blockedBy === "failed"
						? t({
								message: `${name} failed and can't take messages. Go back to message the main agent.`,
							})
						: blockedBy === "host"
							? t({
									message:
										"Update this host to message subagents. Go back to message the main agent.",
								})
							: t({ message: `Messages you send go to ${name}.` });
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Escape") return;
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
			return;
		event.preventDefault();
		event.stopPropagation();
		onBack();
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape from either button goes back, as it does from the composer
		<div
			className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-2 pl-3"
			onKeyDown={onKeyDown}
		>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] text-foreground/70">
				<Bot className="size-4" />
			</span>
			<div className="min-w-48 flex-1 font-sans">
				<output className="block truncate font-medium text-[13px] text-foreground">
					<Trans>Viewing subagent {name}</Trans>
				</output>
				<div className="text-[12px] text-muted-foreground">{detail}</div>
			</div>
			<div className="ml-auto flex items-center gap-0.5">
				{onStop && (
					<button className={PILL_TRIGGER_CLASS} onClick={onStop} type="button">
						<Square className="size-3.5" />
						<Trans>Stop</Trans>
					</button>
				)}
				<button
					className={PILL_TRIGGER_CLASS}
					onClick={onBack}
					ref={backRef}
					type="button"
				>
					<ArrowLeft className="size-3.5" />
					{parentTitle
						? t({ message: `Back to ${parentTitle}` })
						: t({ message: "Back to main chat" })}
					<Kbd className="ml-0.5">Esc</Kbd>
				</button>
			</div>
		</div>
	);
}
