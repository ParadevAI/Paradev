import { type MachineSize, machineSpec } from "@superset/shared/billing";

/** The smallest offered size bigger than the current one, or the current one when none is. */
export function nextMachineSize(
	offered: readonly MachineSize[],
	current: MachineSize,
): MachineSize {
	const currentVcpus = machineSpec(current).vcpus;
	return (
		offered.find((size) => machineSpec(size).vcpus > currentVcpus) ?? current
	);
}
