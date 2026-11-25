import { Trans } from "@lingui/react/macro";
import type { MachineSize } from "@superset/shared/billing";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useMachineSizeOptions } from "renderer/routes/_authenticated/hooks/useMachineSizeOptions";

interface EnvironmentMachineSizeProps {
	id: string;
	className: string;
	/** Null boots at the plan's default size, which is what it shows. */
	machineSize: string | null;
	disabled: boolean;
	onChange: (machineSize: MachineSize) => void;
}

export function EnvironmentMachineSize({
	id,
	className,
	machineSize: saved,
	disabled,
	onChange,
}: EnvironmentMachineSizeProps) {
	const { options, defaultSize } = useMachineSizeOptions();
	const machineSize = saved ?? defaultSize;
	const isOffered = options.some((option) => option.size === machineSize);

	return (
		<Select
			disabled={disabled}
			onValueChange={(next) => onChange(next as MachineSize)}
			value={machineSize}
		>
			<SelectTrigger className={className} id={id}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{!isOffered && (
					<SelectItem disabled value={machineSize}>
						<Trans>{machineSize} (not on your plan)</Trans>
					</SelectItem>
				)}
				{options.map((option) => (
					<SelectItem key={option.size} value={option.size}>
						{option.name}
						<span className="text-muted-foreground">{option.spec}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
