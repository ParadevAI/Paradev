import { Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import { DevDescription } from "./components/DevDescription";
import { DevInstructions } from "./components/DevInstructions";
import { DevRoutines } from "./components/DevRoutines";
import { DevStatus } from "./components/DevStatus";
import { DevTalkToIt } from "./components/DevTalkToIt";
import { PanelSection } from "./components/PanelSection";

type Dev = RouterOutputs["agent"]["get"];

interface DevPanelProps {
	dev: Dev;
	onHide: () => void;
	onCustomize: () => void;
}

export function DevPanel({ dev, onHide, onCustomize }: DevPanelProps) {
	const isPaused = dev.pausedAt !== null;
	return (
		<div className="flex h-full w-full min-w-0 flex-col border-l border-border bg-background">
			<div className="flex h-12 shrink-0 items-center justify-end gap-1 border-b border-border pr-2">
				<RightSidebarToggle isOpen onToggle={onHide} compact />
				<WindowControlsInset />
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="flex flex-col gap-5 p-4">
					<div className="flex items-center gap-3">
						<DevAvatar
							avatar={dev.avatar}
							size={64}
							alive
							mood={isPaused ? "asleep" : dev.working ? "working" : "idle"}
						/>
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-[17px] font-semibold">
								{dev.name}
							</span>
							<DevStatus dev={dev} />
						</div>
						{dev.canManage && (
							<button
								type="button"
								onClick={onCustomize}
								className="shrink-0 rounded-md border border-input px-2.5 py-1 text-[12px] hover:bg-fill-hover"
							>
								<Trans>Customize</Trans>
							</button>
						)}
					</div>
					<DevDescription dev={dev} />
					<PanelSection title={<Trans>Talk to it</Trans>}>
						<DevTalkToIt dev={dev} />
					</PanelSection>
					<DevRoutines devId={dev.id} />
					{dev.canManage && (
						<PanelSection title={<Trans>Instructions</Trans>}>
							<DevInstructions dev={dev} />
						</PanelSection>
					)}
				</div>
			</div>
		</div>
	);
}
