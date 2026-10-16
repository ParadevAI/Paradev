import { useActiveDeviceClient } from "@expo/hub-client";
import { workspaceTrpc } from "@superset/workspace-client";
import type { ReactNode } from "react";
import { DeviceView } from "../../../DeviceView";
import type { LocalDevice } from "../DevicePicker";

interface DeviceSessionProps {
	hubUrl: string;
	hubToken: string;
	device: LocalDevice;
	picker: ReactNode;
}

export function DeviceSession({
	hubUrl,
	hubToken,
	device,
	picker,
}: DeviceSessionProps) {
	const client = useActiveDeviceClient(
		{
			platform: device.platform,
			device: device.id,
			streamMode: device.platform === "ios" ? "mjpeg" : "h264",
		},
		hubUrl,
		{ token: hubToken },
	);
	const rotateDevice = workspaceTrpc.mobile.rotateLocalDevice.useMutation();
	const utils = workspaceTrpc.useUtils();
	const restartHub = workspaceTrpc.mobile.restartLocalHub.useMutation({
		onSettled: () => utils.mobile.localDevices.invalidate(),
	});

	return (
		<DeviceView
			client={client}
			deviceName={device.name}
			picker={picker}
			logStreamUrl={(scope) => {
				const url = new URL(
					device.platform === "ios"
						? `${hubUrl}/vendor/serve-sim/logs`
						: `${hubUrl}/vendor/serve-emu/api/logcat`,
				);
				url.searchParams.set("device", device.id);
				url.searchParams.set("token", hubToken);
				if (device.platform === "ios" && scope === "app") {
					url.searchParams.set("scope", "user-apps");
				}
				return url.toString();
			}}
			onRotate={(orientation) =>
				rotateDevice.mutate({
					platform: device.platform,
					id: device.id,
					orientation,
				})
			}
			onReconnect={() => restartHub.mutate()}
			reconnecting={restartHub.isPending}
		/>
	);
}
