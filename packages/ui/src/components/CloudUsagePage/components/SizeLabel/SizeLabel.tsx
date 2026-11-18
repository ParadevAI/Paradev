"use client";

import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { type MachineSize, machineSpec } from "@superset/shared/billing";

export function SizeLabel({ size }: { size: MachineSize }) {
	const { formatNumber } = useFormat();
	const { vcpus, memoryGb } = machineSpec(size);
	const memory = formatNumber(memoryGb);
	return (
		<Trans>
			{vcpus} vCPU, {memory} GB
		</Trans>
	);
}
