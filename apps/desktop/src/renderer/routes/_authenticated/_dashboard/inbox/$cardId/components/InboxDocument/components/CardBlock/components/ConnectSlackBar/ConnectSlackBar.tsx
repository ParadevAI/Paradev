import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuLink2Off } from "react-icons/lu";

/** Where the reply box goes when the reader has no Slack account of their own connected. */
export function ConnectSlackBar({ onConnect }: { onConnect: () => void }) {
	return (
		<div className="mx-4 mb-4 flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5">
			<LuLink2Off className="size-4 shrink-0 text-muted-foreground" />
			<span className="flex-1 text-[13px] text-muted-foreground">
				<Trans>Slack isn't connected. Connect it to reply as you.</Trans>
			</span>
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="h-7 px-2.5 text-xs"
				onClick={onConnect}
			>
				<Trans>Connect Slack</Trans>
			</Button>
		</div>
	);
}
