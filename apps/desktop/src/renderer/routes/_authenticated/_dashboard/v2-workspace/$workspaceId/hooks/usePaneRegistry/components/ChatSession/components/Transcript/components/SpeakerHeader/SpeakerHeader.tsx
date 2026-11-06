import { Trans } from "@lingui/react/macro";
import type { TranscriptSpeaker } from "../../../../providers/TranscriptCardsProvider";
import { MessageTime } from "../MessageTime";
import { DayDivider } from "./components/DayDivider";

interface SpeakerHeaderProps {
	speaker: TranscriptSpeaker;
	at: number | null;
	newDay: boolean;
	/** The speaker is not part of this chat, such as a coordinator steering it: a centred line says who the message is from. */
	relayed?: boolean;
}

/**
 * The top of a run of one speaker's messages: the face in the gutter, the
 * name, its label and the time, with the day above when the day changed.
 */
export function SpeakerHeader({
	speaker,
	at,
	newDay,
	relayed = false,
}: SpeakerHeaderProps) {
	const divider = newDay && at !== null && <DayDivider at={at} />;
	if (relayed) {
		return (
			<>
				{divider}
				<div className="-ml-10 flex items-center justify-center gap-1.5 pt-4 pb-1.5 text-[12px] text-muted-foreground">
					<Trans>
						Message from{" "}
						<span className="inline-flex items-center gap-1 font-medium text-foreground/80 [&>span]:size-4 [&>span]:rounded-[5px] [&>span]:text-[9px] [&_svg]:size-2.5">
							{speaker.avatar}
							{speaker.name}
						</span>
					</Trans>
					{at !== null && (
						<>
							<span aria-hidden>·</span>
							<MessageTime atMs={at} />
						</>
					)}
				</div>
			</>
		);
	}
	return (
		<>
			{divider}
			<div className="relative flex min-w-0 items-baseline gap-2 pt-3">
				<span className="absolute top-3 -left-10 flex size-7 items-center justify-center">
					{speaker.avatar}
				</span>
				<span className="truncate text-[14px] leading-5 font-semibold text-foreground">
					{speaker.name}
				</span>
				{speaker.badge && (
					<span className="shrink-0 rounded-[4px] bg-muted px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
						{speaker.badge}
					</span>
				)}
				{at !== null && (
					<span className="shrink-0 text-muted-foreground">
						<MessageTime atMs={at} />
					</span>
				)}
			</div>
		</>
	);
}
