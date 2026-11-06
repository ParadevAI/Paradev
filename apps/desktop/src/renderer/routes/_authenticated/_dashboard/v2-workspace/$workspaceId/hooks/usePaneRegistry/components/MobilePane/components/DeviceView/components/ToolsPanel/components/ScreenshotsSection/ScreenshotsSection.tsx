import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { SelectScreenshot } from "@superset/local-db";
import { ScreenshotThumb } from "../../../ScreenshotThumb";
import { ToolsSection } from "../ToolsSection";

interface ScreenshotsSectionProps {
	shots: SelectScreenshot[];
	workspaceId: string;
}

export function ScreenshotsSection({
	shots,
	workspaceId,
}: ScreenshotsSectionProps) {
	const { formatDate } = useFormat();
	return (
		<ToolsSection
			title={<Trans>Screenshots</Trans>}
			summary={shots.length}
			defaultOpen
		>
			{shots.length === 0 ? (
				<div className="py-2 text-center text-xs text-muted-foreground">
					<Trans>No screenshots yet</Trans>
				</div>
			) : (
				<div className="grid grid-cols-3 gap-2">
					{shots.map((shot) => (
						<div key={shot.id} className="flex flex-col gap-1">
							<ScreenshotThumb
								shot={shot}
								workspaceId={workspaceId}
								className="aspect-[9/19.5]"
							/>
							<span className="text-center font-mono text-[10px] tabular-nums text-muted-foreground">
								{formatDate(new Date(shot.capturedAt), { timeStyle: "short" })}
							</span>
						</div>
					))}
				</div>
			)}
		</ToolsSection>
	);
}
