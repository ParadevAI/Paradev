import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { ChevronDown, ZoomIn } from "lucide-react";
import { PREVIEW_ZOOM_STEPS, type PreviewZoom } from "../../utils/previewZoom";

const percent = (step: number) =>
	formatPercent(step, { maximumFractionDigits: 0 });

export function ZoomMenu({
	className,
	onChange,
	zoom,
}: {
	zoom: PreviewZoom;
	onChange: (zoom: PreviewZoom) => void;
	className?: string;
}) {
	const { t } = useLingui();
	const fitLabel = t({ message: "Fit" });
	const menuLabel = t({ message: "Zoom" });
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					aria-label={menuLabel}
					className={cn(
						"flex h-6 items-center gap-1 rounded-md px-1.5 text-xs tabular-nums",
						className,
					)}
					title={menuLabel}
					type="button"
				>
					<ZoomIn className="size-3.5" />
					{zoom === "fit" ? fitLabel : percent(zoom)}
					<ChevronDown className="size-3 opacity-60" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="z-[110] min-w-24">
				<DropdownMenuRadioGroup
					onValueChange={(value) =>
						onChange(
							PREVIEW_ZOOM_STEPS.find((step) => String(step) === value) ??
								"fit",
						)
					}
					value={String(zoom)}
				>
					<DropdownMenuRadioItem value="fit">{fitLabel}</DropdownMenuRadioItem>
					{PREVIEW_ZOOM_STEPS.map((step) => (
						<DropdownMenuRadioItem key={step} value={String(step)}>
							{percent(step)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
