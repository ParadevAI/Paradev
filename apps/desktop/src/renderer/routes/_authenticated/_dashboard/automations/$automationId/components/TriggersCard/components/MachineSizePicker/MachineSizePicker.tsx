import { Trans, useLingui } from "@lingui/react/macro";
import type { MachineSize } from "@superset/shared/billing";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiCheck } from "react-icons/hi2";
import { LuCpu } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { useMachineSizeOptions } from "renderer/routes/_authenticated/hooks/useMachineSizeOptions";

interface MachineSizePickerProps {
	value: MachineSize | null;
	onChange: (machineSize: MachineSize | null) => void;
	className?: string;
	disabled?: boolean;
}

export function MachineSizePicker({
	value,
	onChange,
	className,
	disabled,
}: MachineSizePickerProps) {
	const { t } = useLingui();
	const { options } = useMachineSizeOptions();
	const selected = options.find((option) => option.size === value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<PickerTrigger
					disabled={disabled}
					className={className}
					icon={<LuCpu className="size-4 shrink-0" />}
					label={
						selected?.name ?? value ?? t({ message: "Environment's size" })
					}
					title={selected?.spec}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuItem
					onSelect={() => onChange(null)}
					className="items-start gap-2"
				>
					<LuCpu className="mt-0.5 size-4 shrink-0" />
					<span className="flex-1">
						<Trans>Environment's size</Trans>
					</span>
					{value === null && <HiCheck className="mt-0.5 size-4 shrink-0" />}
				</DropdownMenuItem>
				{options.map((option) => (
					<DropdownMenuItem
						key={option.size}
						onSelect={() => onChange(option.size)}
						className="items-start gap-2"
					>
						<LuCpu className="mt-0.5 size-4 shrink-0" />
						<span className="flex min-w-0 flex-1 items-baseline gap-1.5">
							<span>{option.name}</span>
							<span className="text-xs text-muted-foreground">
								{option.spec}
							</span>
						</span>
						{option.size === selected?.size && (
							<HiCheck className="mt-0.5 size-4 shrink-0" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
