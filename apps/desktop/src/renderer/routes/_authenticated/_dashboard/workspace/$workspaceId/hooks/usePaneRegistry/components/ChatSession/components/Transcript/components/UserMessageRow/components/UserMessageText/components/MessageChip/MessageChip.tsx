import { Chip } from "@superset/chat-ui/Chip";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { useChatPaneActions } from "../../../../../../../../providers/ChatPaneActionsProvider";
import { chipLink } from "../../../../../../../../utils/linkChip";
import { LinkHoverCard } from "../../../../../../../LinkHoverCard";
import { LinkMenu } from "../../../../../../../LinkMenu";

export function MessageChip({
	chip,
	link,
}: {
	chip: ComposerChip;
	link?: string | undefined;
}) {
	const { openLink } = useChatPaneActions();
	const href = link ?? chipLink(chip);
	if (!href) return <Chip chip={chip} />;
	return (
		<LinkHoverCard link={href}>
			<LinkMenu href={href}>
				<a
					className="no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					href={href}
					onClick={(event) => {
						if (openLink?.(href, event)) event.preventDefault();
					}}
					rel="noreferrer"
					target="_blank"
				>
					<Chip chip={chip} tooltip={false} />
				</a>
			</LinkMenu>
		</LinkHoverCard>
	);
}
