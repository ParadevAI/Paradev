import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import { DevActivity } from "./components/DevActivity";
import { DevInstructions } from "./components/DevInstructions";
import { DevTalkToIt } from "./components/DevTalkToIt";
import { PanelSection } from "./components/PanelSection";
import { useUpdateDev } from "./hooks/useUpdateDev";

type Dev = RouterOutputs["agent"]["get"];

interface DevPanelProps {
	dev: Dev;
	onHide: () => void;
	onCustomize: () => void;
}

/** A Dev's profile beside its DM: who it is, where to reach it, what it is doing. */
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
							mood={isPaused ? "asleep" : dev.isWorking ? "working" : "idle"}
						/>
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-[17px] font-semibold">
								{dev.name}
							</span>
							<span className="text-[13px] text-muted-foreground">
								{isPaused ? (
									<Trans>Paused</Trans>
								) : dev.isWorking ? (
									<Trans>Working</Trans>
								) : (
									<Trans>Ready</Trans>
								)}
							</span>
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
					<PanelSection title={<Trans>Working on</Trans>}>
						<DevActivity dev={dev} />
					</PanelSection>
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

function DevDescription({ dev }: { dev: Dev }) {
	const { t } = useLingui();
	const update = useUpdateDev();
	const [draft, setDraft] = useState<string | null>(null);
	if (draft !== null) {
		return (
			<form
				className="flex flex-col gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					update.mutate({ agentId: dev.id, description: draft.trim() || null });
					setDraft(null);
				}}
			>
				<Textarea
					autoFocus
					value={draft}
					maxLength={500}
					placeholder={t({ message: "What it does" })}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") setDraft(null);
					}}
					className="min-h-20 text-[13px]"
				/>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setDraft(null)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button type="submit" size="sm">
						<Trans>Save</Trans>
					</Button>
				</div>
			</form>
		);
	}
	if (!dev.canManage) {
		return dev.description ? (
			<p className="text-[13px] whitespace-pre-wrap text-foreground/80">
				{dev.description}
			</p>
		) : null;
	}
	return (
		<button
			type="button"
			onClick={() => setDraft(dev.description ?? "")}
			className="-mx-2 rounded-md px-2 py-1 text-left text-[13px] whitespace-pre-wrap text-foreground/80 hover:bg-fill-hover"
		>
			{dev.description || (
				<span className="text-muted-foreground">
					<Trans>Add what it does</Trans>
				</span>
			)}
		</button>
	);
}
