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

const ORGANIZATION_DEFAULT = "default";

interface EnvironmentMachineSizeProps {
	id: string;
	className: string;
	machineSize: string | null;
	disabled: boolean;
	onChange: (machineSize: MachineSize | null) => void;
}

export function EnvironmentMachineSize({
	id,
	className,
	machineSize,
	disabled,
	onChange,
}: EnvironmentMachineSizeProps) {
	const { options, defaultSize } = useMachineSizeOptions();
	const defaultName =
		options.find((option) => option.size === defaultSize)?.name ?? defaultSize;
	const isOffered =
		machineSize === null ||
		options.some((option) => option.size === machineSize);

	return (
		<Select
			disabled={disabled}
			onValueChange={(value) =>
				onChange(value === ORGANIZATION_DEFAULT ? null : (value as MachineSize))
			}
			value={machineSize ?? ORGANIZATION_DEFAULT}
		>
			<SelectTrigger className={className} id={id}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ORGANIZATION_DEFAULT}>
					<Trans>Organization default ({defaultName})</Trans>
				</SelectItem>
				{!isOffered && machineSize && (
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
