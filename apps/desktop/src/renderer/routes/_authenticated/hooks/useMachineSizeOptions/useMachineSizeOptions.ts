import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	defaultMachineSize,
	type MachineSize,
	machineSpec,
	offeredMachineSizes,
} from "@superset/shared/billing";
import { MACHINE_SIZE_NAMES } from "@superset/shared/machine-size-names";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export interface MachineSizeOption {
	size: MachineSize;
	name: string;
	spec: string;
}

const FALLBACK_SIZES = offeredMachineSizes([]);

export function useMachineSizeOptions(): {
	options: MachineSizeOption[];
	defaultSize: MachineSize;
} {
	const { i18n, t } = useLingui();
	const { formatNumber } = useFormat();
	const organizationId = useActiveOrganizationId();
	const { data } = cloudTrpc.cloudWorkspace.machineSizes.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: Boolean(organizationId) },
	);
	return useMemo(() => {
		const sizes = data?.sizes.map((size) => size.name) ?? FALLBACK_SIZES;

		return {
			defaultSize: data?.defaultSize ?? defaultMachineSize(sizes),
			options: sizes.map((size) => {
				const { vcpus, memoryGb } = machineSpec(size);
				const vcpuCount = formatNumber(vcpus);
				const memory = formatNumber(memoryGb);
				return {
					size,
					name: i18n._(MACHINE_SIZE_NAMES[size]),
					spec: t({ message: `${vcpuCount} vCPU · ${memory} GB` }),
				};
			}),
		};
	}, [data, i18n, t, formatNumber]);
}
