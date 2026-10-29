import { useLingui } from "@lingui/react/macro";
import type { MachineSize } from "@superset/shared/billing";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuCpu } from "react-icons/lu";
import { useMachineSizeOptions } from "renderer/routes/_authenticated/hooks/useMachineSizeOptions";
import {
	FORM_PICKER_MENU_CLASS,
	FormPickerTrigger,
} from "../FormPickerTrigger";

interface MachineSizePickerPillProps {
	machineSize: MachineSize | null;
	onSelectMachineSize: (machineSize: MachineSize) => void;
}

export function MachineSizePickerPill({
	machineSize,
	onSelectMachineSize,
}: MachineSizePickerPillProps) {
	const { t } = useLingui();
	const { options, defaultSize } = useMachineSizeOptions();
	const selected =
		options.find((option) => option.size === machineSize) ??
		options.find((option) => option.size === defaultSize);
	const label = selected?.name ?? machineSize ?? defaultSize;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FormPickerTrigger
					aria-label={t({ message: `Machine size: ${label}` })}
					title={selected?.spec ?? label}
				>
					<LuCpu className="size-3 shrink-0" />
					<span className="truncate">{label}</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className={`w-64 ${FORM_PICKER_MENU_CLASS}`}
			>
				{options.map((option) => (
					<DropdownMenuItem
						key={option.size}
						onSelect={() => onSelectMachineSize(option.size)}
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
