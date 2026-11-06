import type { TranscriptSpeaker } from "../../../../providers/TranscriptCardsProvider";
import { MessageTime } from "../MessageTime";
import { DayDivider } from "./components/DayDivider";

interface SpeakerHeaderProps {
	speaker: TranscriptSpeaker;
	at: number | null;
	newDay: boolean;
}

/**
 * The top of a run of one speaker's messages: the face in the gutter, the
 * name, its label and the time, with the day above when the day changed.
 */
export function SpeakerHeader({ speaker, at, newDay }: SpeakerHeaderProps) {
	return (
		<>
			{newDay && at !== null && <DayDivider at={at} />}
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
