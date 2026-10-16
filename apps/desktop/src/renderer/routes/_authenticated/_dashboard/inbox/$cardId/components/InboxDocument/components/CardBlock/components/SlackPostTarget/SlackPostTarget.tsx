import { Trans, useLingui } from "@lingui/react/macro";
import { LuX } from "react-icons/lu";
import type { SlackPostView } from "../../types";
import { SlackChannelLabel } from "../SlackChannelLabel";
import { SlackPersonRow } from "../SlackPersonRow";

interface SlackPostTargetProps {
	target: SlackPostView["target"];
	recipients: SlackPostView["recipients"];
	/** Takes one person out of a group; absent when the row is read only. */
	onRemove?: (id: string) => void;
	disabled?: boolean;
}

/** Where the message goes, as Slack's "To:" field shows it: a channel, or the people of a DM. */
export function SlackPostTarget({
	target,
	recipients,
	onRemove,
	disabled,
}: SlackPostTargetProps) {
	const { t } = useLingui();
	if (!target)
		return (
			<span className="text-muted-foreground">
				<Trans>Nowhere yet</Trans>
			</span>
		);
	if (target.kind === "channel" || target.kind === "private")
		return <SlackChannelLabel channel={target} />;
	return (
		<span className="flex min-w-0 flex-wrap items-center gap-1.5">
			{recipients.map((person) => {
				const name = person.name;
				return (
					<span
						key={person.id}
						data-recipient={person.id}
						className="flex h-7 min-w-0 items-center gap-2 rounded-md bg-muted/60 px-1.5 text-[13px]"
					>
						<SlackPersonRow person={person} />
						{onRemove && recipients.length > 1 && (
							<button
								type="button"
								disabled={disabled}
								aria-label={t({ message: `Remove ${name}` })}
								onClick={() => onRemove(person.id)}
								className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-fill-hover hover:text-foreground disabled:opacity-50"
							>
								<LuX className="size-3" />
							</button>
						)}
					</span>
				);
			})}
		</span>
	);
}
