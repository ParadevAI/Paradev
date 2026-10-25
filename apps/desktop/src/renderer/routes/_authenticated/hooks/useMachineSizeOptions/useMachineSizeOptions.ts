import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	defaultMachineSize,
	type MachineSize,
	machineSpec,
	offeredMachineSizes,
} from "@superset/shared/billing";
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
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const organizationId = useActiveOrganizationId();
	const { data } = cloudTrpc.cloudWorkspace.machineSizes.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: Boolean(organizationId) },
	);
	const sizes = data?.sizes.map((size) => size.name) ?? FALLBACK_SIZES;
	const names: Record<MachineSize, string> = {
		small: t({ message: "Small", context: "machine size" }),
		medium: t({ message: "Medium", context: "machine size" }),
		large: t({ message: "Large", context: "machine size" }),
		xlarge: t({ message: "X-Large", context: "machine size" }),
		"2xlarge": t({ message: "2X-Large", context: "machine size" }),
	};

	return {
		defaultSize: data?.defaultSize ?? defaultMachineSize(sizes),
		options: sizes.map((size) => {
			const { vcpus, memoryGb } = machineSpec(size);
			const vcpuCount = formatNumber(vcpus);
			const memory = formatNumber(memoryGb);
			return {
				size,
				name: names[size],
				spec: t({ message: `${vcpuCount} vCPU · ${memory} GB` }),
			};
		}),
	};
}
