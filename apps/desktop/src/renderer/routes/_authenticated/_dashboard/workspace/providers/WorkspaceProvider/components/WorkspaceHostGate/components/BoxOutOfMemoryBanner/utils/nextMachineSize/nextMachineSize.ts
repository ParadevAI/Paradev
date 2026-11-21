import { type MachineSize, machineSpec } from "@superset/shared/billing";

export function nextMachineSize(
	offered: readonly MachineSize[],
	current: MachineSize,
): MachineSize {
	const vcpus = (size: MachineSize) => machineSpec(size).vcpus;
	const larger = offered.filter((size) => vcpus(size) > vcpus(current));
	return larger.reduce(
		(smallest, size) => (vcpus(size) < vcpus(smallest) ? size : smallest),
		larger[0] ?? current,
	);
}
