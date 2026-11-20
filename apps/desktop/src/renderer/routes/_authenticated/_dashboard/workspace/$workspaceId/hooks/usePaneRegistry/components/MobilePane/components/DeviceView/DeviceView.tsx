import {
	type DeviceClient,
	DeviceScreen,
	displayScreen,
} from "@expo/hub-client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { fileToBase64 } from "renderer/lib/file-to-base64";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { DeviceActions } from "./components/DeviceActions";
import { DeviceControls } from "./components/DeviceControls";
import { type LogScope, LogsDrawer } from "./components/LogsDrawer";
import { ScreenshotStrip } from "./components/ScreenshotStrip";
import { ToolsPanel } from "./components/ToolsPanel";
import { useDeviceScreenshots } from "./hooks/useDeviceScreenshots";

export type RequestedOrientation = "portrait" | "landscape";

interface DeviceViewProps {
	client: DeviceClient;
	workspaceId: string;
	deviceKey: string;
	deviceName: string;
	picker: ReactNode;
	logStreamUrl: (scope: LogScope) => string;
	onRotate: (orientation: RequestedOrientation) => void;
	onReconnect?: () => void;
	reconnecting?: boolean;
}

const FALLBACK_ASPECT_RATIO = 9 / 19.5;
const STALLED_AFTER_MS = 10_000;
/** Below this the strip would cover the centered control bar. */
const STRIP_MIN_PANE_WIDTH = 680;

export function DeviceView({
	client,
	workspaceId,
	deviceKey,
	deviceName,
	picker,
	logStreamUrl,
	onRotate,
	onReconnect,
	reconnecting,
}: DeviceViewProps) {
	const screen = displayScreen(client.screen);
	const aspectRatio = screen
		? screen.width / screen.height
		: FALLBACK_ASPECT_RATIO;

	// An app that is locked to portrait keeps reporting a portrait screen
	// while the device is turned, so the last request decides the next one.
	const [requestedLandscape, setRequestedLandscape] = useState<boolean | null>(
		null,
	);
	const rotate = () => {
		const landscape = !(requestedLandscape ?? aspectRatio > 1);
		setRequestedLandscape(landscape);
		onRotate(landscape ? "landscape" : "portrait");
	};

	// hub-client paints a black box and a broken image until the first frame.
	const hasPicture =
		client.status === "streaming" || client.status === "reconnecting";
	const [stalled, setStalled] = useState(false);
	useEffect(() => {
		setStalled(false);
		if (client.status === "streaming") return;
		const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
		return () => clearTimeout(timer);
	}, [client.status]);

	const { t } = useLingui();
	const shots = useDeviceScreenshots(deviceKey);
	const rootRef = useRef<HTMLDivElement>(null);
	const [roomForStrip, setRoomForStrip] = useState(false);
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) {
				setRoomForStrip(entry.contentRect.width >= STRIP_MIN_PANE_WIDTH);
			}
		});
		observer.observe(root);
		return () => observer.disconnect();
	}, []);
	const [lastCapturedAt, setLastCapturedAt] = useState(0);
	const takeScreenshot = async () => {
		try {
			const capture = await client.screenshot();
			if (!capture) throw new Error("No screenshot");
			await electronTrpcClient.screenshots.saveDeviceCapture.mutate({
				pngBase64: await fileToBase64(capture.blob),
				deviceKey,
				deviceName,
			});
			setLastCapturedAt(Date.now());
			if (!roomForStrip) toast.success(t({ message: "Screenshot copied" }));
		} catch {
			toast.error(t({ message: "Couldn't take a screenshot" }));
		}
	};
	const [expanded, setExpanded] = useState(false);
	const [toolsOpen, setToolsOpen] = useState(false);
	const [logsOpen, setLogsOpen] = useState(false);

	useEffect(() => {
		if (!expanded) return;
		const exitOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setExpanded(false);
		};
		window.addEventListener("keydown", exitOnEscape, true);
		return () => window.removeEventListener("keydown", exitOnEscape, true);
	}, [expanded]);

	return (
		<div ref={rootRef} className="flex size-full flex-col bg-background">
			<div className="relative flex min-h-0 flex-1 flex-col">
				{!expanded && picker}
				<DeviceActions
					expanded={expanded}
					onToggleExpanded={() => setExpanded((value) => !value)}
					onToggleTools={() => setToolsOpen((value) => !value)}
					onToggleLogs={() => setLogsOpen((value) => !value)}
				/>
				{!expanded && (
					<DeviceControls
						client={client}
						onRotate={rotate}
						onScreenshot={() => void takeScreenshot()}
					/>
				)}
				{!expanded && !toolsOpen && roomForStrip && (
					<ScreenshotStrip
						shots={shots}
						workspaceId={workspaceId}
						lastCapturedAt={lastCapturedAt}
						onShowAll={() => setToolsOpen(true)}
					/>
				)}
				{!expanded && toolsOpen && (
					<ToolsPanel
						client={client}
						onClose={() => setToolsOpen(false)}
						shots={shots}
						workspaceId={workspaceId}
					/>
				)}
				{!expanded && logsOpen && (
					<LogsDrawer
						platform={client.platform}
						deviceName={deviceName}
						streamUrl={logStreamUrl}
						onClose={() => setLogsOpen(false)}
					/>
				)}
				<div
					className={cn(
						"flex min-h-0 flex-1 items-center justify-center",
						expanded ? "m-1" : "mx-3 mt-14 mb-16",
					)}
					style={{ containerType: "size" }}
				>
					<div
						className="relative"
						style={{
							aspectRatio,
							width:
								aspectRatio > 1
									? "min(100cqw, 100cqh)"
									: `min(100cqw, calc(100cqh * ${aspectRatio}))`,
						}}
					>
						<DeviceScreen client={client} borderRadius={20} />
						<div
							className={cn(
								"pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[20px] px-6 text-center text-sm text-muted-foreground",
								!hasPicture && "bg-muted",
							)}
						>
							{!hasPicture &&
								(client.status === "error" ? (
									<span>
										{client.error ?? (
											<Trans>Could not reach {deviceName}.</Trans>
										)}
									</span>
								) : (
									<>
										<Spinner className="size-4" />
										<span>
											<Trans>Connecting to {deviceName}…</Trans>
										</span>
									</>
								))}
							{stalled && onReconnect && (
								<Button
									variant="outline"
									size="sm"
									className="pointer-events-auto"
									disabled={reconnecting}
									onClick={onReconnect}
								>
									<Trans>Reconnect</Trans>
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
