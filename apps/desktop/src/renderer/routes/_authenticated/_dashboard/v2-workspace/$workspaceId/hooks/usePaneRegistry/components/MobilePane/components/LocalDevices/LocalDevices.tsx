import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";
import { PaneMessage } from "../PaneMessage";
import { DevicePicker, type LocalDevice } from "./components/DevicePicker";
import { DeviceSession } from "./components/DeviceSession";
import { useDeviceLease } from "./hooks/useDeviceLease";
import { deviceKey } from "./utils/deviceKey";

interface LocalDevicesProps {
	workspaceId: string;
}

export function LocalDevices({ workspaceId }: LocalDevicesProps) {
	// A cached list can show a device as running after it shut down, and
	// mounting its stream would boot it again.
	const devicesQuery = workspaceTrpc.mobile.localDevices.useQuery(
		{ workspaceId },
		{ refetchInterval: 3000, gcTime: 0 },
	);
	const boot = workspaceTrpc.mobile.bootLocalDevice.useMutation({
		onSettled: () => devicesQuery.refetch(),
	});
	const shutdown = workspaceTrpc.mobile.shutdownLocalDevice.useMutation({
		onSettled: () => devicesQuery.refetch(),
	});
	const remember = workspaceTrpc.mobile.rememberLocalDevice.useMutation();
	const [selectedKey, setSelectedKey] = useState<string | null>(null);

	const data = devicesQuery.data;
	const lastPickedKey = data?.lastPicked
		? `${data.lastPicked.platform}:${data.lastPicked.key}`
		: null;
	const selected =
		data?.devices.find((device) => deviceKey(device) === selectedKey) ??
		data?.devices.find((device) => deviceKey(device) === lastPickedKey) ??
		data?.devices.find((device) => device.booted) ??
		null;
	useDeviceLease(selected);

	if (devicesQuery.isPending) {
		return (
			<PaneMessage>
				<Trans>Starting the simulator…</Trans>
			</PaneMessage>
		);
	}
	if (devicesQuery.isError) {
		return (
			<PaneMessage>
				<Trans>Could not reach a mobile simulator.</Trans>
				<div className="mt-2 text-xs opacity-70">
					{errorMessage(devicesQuery.error)}
				</div>
				<Button
					variant="outline"
					size="sm"
					className="mt-3"
					onClick={() => devicesQuery.refetch()}
				>
					<Trans>Retry</Trans>
				</Button>
			</PaneMessage>
		);
	}

	const { hubUrl, hubToken, devices } = devicesQuery.data;

	const select = (device: LocalDevice) => {
		setSelectedKey(deviceKey(device));
		remember.mutate({ ...device, workspaceId });
		if (!device.booted) boot.mutate(device);
	};
	const booting =
		selected !== null &&
		boot.variables !== undefined &&
		deviceKey(boot.variables) === deviceKey(selected) &&
		!boot.isError;

	const picker = (
		<DevicePicker
			devices={devices}
			selected={selected}
			onSelect={select}
			onShutdown={() => {
				if (!selected) return;
				setSelectedKey(null);
				boot.reset();
				shutdown.mutate(selected);
			}}
		/>
	);

	if (selected?.booted) {
		return (
			<DeviceSession
				key={`${deviceKey(selected)}:${selected.id}`}
				hubUrl={hubUrl}
				hubToken={hubToken}
				workspaceId={workspaceId}
				device={selected}
				picker={picker}
			/>
		);
	}

	return (
		<div className="relative flex size-full flex-col">
			{picker}
			<PaneMessage>
				{!selected ? (
					<Trans>No device is running.</Trans>
				) : booting ? (
					<Trans>Booting {selected.name}…</Trans>
				) : (
					<>
						<div>
							<Trans>{selected.name} is not running.</Trans>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="mt-3"
							onClick={() => boot.mutate(selected)}
						>
							<Trans>Boot</Trans>
						</Button>
					</>
				)}
				{boot.error && (
					<div className="mt-2 text-xs opacity-70">
						{errorMessage(boot.error)}
					</div>
				)}
			</PaneMessage>
		</div>
	);
}
