import type { DeviceClient } from "@expo/hub-client";
import { useLingui } from "@lingui/react/macro";
import {
	TbArrowBackUp,
	TbCamera,
	TbHome,
	TbRefresh,
	TbRotateClockwise2,
	TbSquare,
} from "react-icons/tb";
import { DeviceControlButton } from "../../../DeviceControlButton";
import { FloatingBar } from "../../../FloatingBar";

interface DeviceControlsProps {
	client: DeviceClient;
	onRotate: () => void;
	onScreenshot: () => void;
}

export function DeviceControls({
	client,
	onRotate,
	onScreenshot,
}: DeviceControlsProps) {
	const { t } = useLingui();
	const disconnected = client.status !== "streaming";
	const isAndroid = client.platform === "android";

	return (
		<FloatingBar className="bottom-3 left-1/2 -translate-x-1/2">
			{client.foregroundApp?.isReactNative && (
				<DeviceControlButton
					label={t({ message: "Reload app" })}
					side="top"
					disabled={disconnected}
					onClick={client.reload}
				>
					<TbRefresh className="size-4" />
				</DeviceControlButton>
			)}
			{isAndroid && (
				<DeviceControlButton
					label={t({ message: "Back", context: "Android back button" })}
					side="top"
					disabled={disconnected}
					onClick={() => client.pressButton("back")}
				>
					<TbArrowBackUp className="size-4" />
				</DeviceControlButton>
			)}
			<DeviceControlButton
				label={t({ message: "Home", context: "device home button" })}
				side="top"
				disabled={disconnected}
				onClick={() => client.pressButton("home")}
			>
				<TbHome className="size-4" />
			</DeviceControlButton>
			{isAndroid && (
				<DeviceControlButton
					label={t({ message: "Recent apps" })}
					side="top"
					disabled={disconnected}
					onClick={() => client.pressButton("recents")}
				>
					<TbSquare className="size-4" />
				</DeviceControlButton>
			)}
			<DeviceControlButton
				label={t({ message: "Take screenshot" })}
				side="top"
				disabled={disconnected}
				onClick={onScreenshot}
			>
				<TbCamera className="size-4" />
			</DeviceControlButton>
			<DeviceControlButton
				label={t({ message: "Rotate" })}
				side="top"
				disabled={disconnected}
				onClick={onRotate}
			>
				<TbRotateClockwise2 className="size-4" />
			</DeviceControlButton>
		</FloatingBar>
	);
}
