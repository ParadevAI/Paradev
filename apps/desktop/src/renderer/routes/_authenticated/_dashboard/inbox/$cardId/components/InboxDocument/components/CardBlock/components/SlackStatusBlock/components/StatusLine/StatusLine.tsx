import { Trans } from "@lingui/react/macro";
import { slackWhen } from "../../../../utils/slackWhen";
import { EmojiGlyph } from "../../../SlackMessage/components/EmojiGlyph";

interface StatusLineProps {
	/** `:name:`, or empty. */
	emoji: string;
	text: string;
	/** ISO time the status clears itself. */
	until: string | null;
	timeZone: string;
	/** Custom emoji name to image url. */
	custom: Readonly<Record<string, string>>;
}

/** A status as Slack shows it beside a name: the emoji, the words, and when it clears. */
export function StatusLine({
	emoji,
	text,
	until,
	timeZone,
	custom,
}: StatusLineProps) {
	const name = emoji.replace(/^:|:$/g, "");
	const when = until ? slackWhen(Date.parse(until), timeZone) : null;
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-foreground">
			{name && <EmojiGlyph name={name} emoji={custom} tooltip={false} />}
			<span className="truncate">{text}</span>
			{when && (
				<span className="shrink-0 text-xs text-muted-foreground">
					<Trans>until {when}</Trans>
				</span>
			)}
		</span>
	);
}
