import type { LocalDevice } from "../../components/DevicePicker";

/** Simulators on different iOS runtimes can share a name. An emulator's id
 * is its serial, which only exists while it runs, so it is keyed by name. */
export function deviceKey(
	device: Pick<LocalDevice, "platform" | "id" | "name">,
): string {
	return `${device.platform}:${device.platform === "ios" ? device.id : device.name}`;
}
