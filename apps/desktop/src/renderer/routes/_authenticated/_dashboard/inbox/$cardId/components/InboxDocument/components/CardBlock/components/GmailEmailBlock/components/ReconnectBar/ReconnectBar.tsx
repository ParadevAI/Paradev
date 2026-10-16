import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { BrandMark } from "renderer/routes/_authenticated/_dashboard/components/BrandMark";

interface ReconnectBarProps {
	onConnect: () => void;
}

/** In place of the reply box when the Google connection predates sending: reconnect once, then send from here. */
export function ReconnectBar({ onConnect }: ReconnectBarProps) {
	return (
		<div className="mx-4 my-4 flex items-center gap-3 rounded-lg border border-border px-4 py-3">
			<BrandMark brand="gmail" className="size-5 shrink-0" />
			<span className="flex-1 text-[13px] text-muted-foreground">
				<Trans>Reconnect Google to reply and archive as you</Trans>
			</span>
			<Button size="sm" onClick={onConnect}>
				<Trans>Reconnect</Trans>
			</Button>
		</div>
	);
}
