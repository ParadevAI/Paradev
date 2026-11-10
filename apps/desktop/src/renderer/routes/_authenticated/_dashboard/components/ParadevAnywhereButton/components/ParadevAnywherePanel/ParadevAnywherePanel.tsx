import { Trans, useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import type { ReactNode } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useOpenNewWorkspaceForHost } from "renderer/hooks/useOpenNewWorkspace";
import { track } from "renderer/lib/analytics";
import { CliScene } from "./components/CliScene";
import { CloudScene } from "./components/CloudScene";
import { MobileScene } from "./components/MobileScene";
import { RemoteScene } from "./components/RemoteScene";
import { SurfaceTile } from "./components/SurfaceTile";
import { useStartCliTour } from "./hooks/useStartCliTour";

const ICON_CLASS = "size-3.5";
const ICON_STROKE_WIDTH = 1.75;

interface Surface {
	id: string;
	title: string;
	caption: string;
	scene: ReactNode;
	open: () => void;
}

interface ParadevAnywherePanelProps {
	onClose: () => void;
	onHide: () => void;
}

export function ParadevAnywherePanel({
	onClose,
	onHide,
}: ParadevAnywherePanelProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const startCliTour = useStartCliTour();
	const openNewWorkspaceForHost = useOpenNewWorkspaceForHost();
	// Team and Ultra plans: the flag is evaluated with the org's plan tier.
	const hasCloud = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);

	const surfaces: Surface[] = [
		{
			id: "mobile",
			title: t({ message: "Mobile" }),
			caption: t({ message: "Agents in your pocket" }),
			scene: <MobileScene />,
			open: () => navigate({ to: "/settings/mobile" }),
		},
		{
			id: "cloud",
			title: t({ message: "Cloud" }),
			caption: t({ message: "Runs while you sleep" }),
			scene: <CloudScene />,
			open:
				hasCloud === false
					? () => navigate({ to: "/settings/billing/plans" })
					: () => openNewWorkspaceForHost(CLOUD_HOST_ID),
		},
		{
			id: "cli",
			title: t({ message: "CLI" }),
			caption: t({ message: "See what it can do" }),
			scene: <CliScene />,
			open: startCliTour,
		},
		{
			id: "self-hosted",
			title: t({ message: "Self-hosted" }),
			caption: t({ message: "Run on any machine" }),
			scene: <RemoteScene />,
			open: () =>
				gateFeature(GATED_FEATURES.REMOTE_ACCESS, () =>
					navigate({ to: "/settings/hosts" }),
				),
		},
	];

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between pl-0.5">
				<h2 className="text-sm font-medium text-foreground">
					<Trans>Use Paradev anywhere</Trans>
				</h2>
				<button
					type="button"
					aria-label={t({ message: "Close" })}
					onClick={onClose}
					className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
				>
					<X className={ICON_CLASS} strokeWidth={ICON_STROKE_WIDTH} />
				</button>
			</div>
			<div className="grid grid-cols-2 gap-2">
				{surfaces.map((surface) => (
					<SurfaceTile
						key={surface.id}
						title={surface.title}
						caption={surface.caption}
						onClick={() => {
							track("paradev_anywhere_surface_clicked", {
								surface: surface.id,
							});
							onClose();
							surface.open();
						}}
					>
						{surface.scene}
					</SurfaceTile>
				))}
			</div>
			<button
				type="button"
				onClick={onHide}
				className="self-start rounded-sm px-0.5 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
			>
				<Trans>Hide from sidebar</Trans>
			</button>
		</div>
	);
}
