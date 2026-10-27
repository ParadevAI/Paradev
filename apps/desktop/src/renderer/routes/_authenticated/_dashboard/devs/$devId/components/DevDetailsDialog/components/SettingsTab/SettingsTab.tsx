import { Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";

type Dev = RouterOutputs["agent"]["get"];

interface SettingsTabProps {
	dev: Dev;
	onTogglePause: () => void;
	onArchive: () => void;
}

export function SettingsTab({
	dev,
	onTogglePause,
	onArchive,
}: SettingsTabProps) {
	const isPaused = dev.pausedAt !== null;
	return (
		<div className="flex flex-col gap-4">
			<div className="overflow-hidden rounded-lg border border-border bg-background">
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<div className="flex flex-col">
						<span className="text-sm font-semibold">
							{isPaused ? <Trans>Resume</Trans> : <Trans>Pause</Trans>}
						</span>
						<span className="text-xs text-muted-foreground">
							<Trans>A paused Dev starts no work. Its chats stay open.</Trans>
						</span>
					</div>
					<Button variant="outline" size="sm" onClick={onTogglePause}>
						{isPaused ? <Trans>Resume</Trans> : <Trans>Pause</Trans>}
					</Button>
				</div>
			</div>
			<div className="overflow-hidden rounded-lg border border-border bg-background px-4 py-3">
				<Button variant="destructive" size="sm" onClick={onArchive}>
					<Trans>Archive Dev</Trans>
				</Button>
			</div>
		</div>
	);
}
