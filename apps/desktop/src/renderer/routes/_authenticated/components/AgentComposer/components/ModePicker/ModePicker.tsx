import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	FastForward,
	type LucideIcon,
	Pause,
	Play,
	SlidersHorizontal,
} from "lucide-react";
import { LuCheck, LuChevronDown } from "react-icons/lu";
import { isUnrestrictedMode } from "renderer/routes/_authenticated/utils/isUnrestrictedMode";
import {
	MENU_DESCRIPTION_CLASS,
	MENU_PANEL_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "../../constants";
import { useOptimisticSelections } from "../../hooks/useOptimisticSelections";
import { KNOWN_MODES } from "../../utils/modeCopy";

export type SessionMode = { id: string; label: string };

type ModeCopy = {
	title: string;
	description: string;
	icon: LucideIcon;
	unrestricted?: boolean;
};

const HIDDEN_MODE_IDS = new Set(["plan", "acceptEdits", "workspace-write"]);
const SOLID_ICONS = new Set<LucideIcon>([Pause, Play, FastForward]);
const UNRESTRICTED_TINT = "text-highlight";

export function ModePicker({
	currentModeId,
	hiddenModeIds = HIDDEN_MODE_IDS,
	iconOnly,
	modes,
	onSelect,
}: {
	modes: readonly SessionMode[];
	currentModeId: string | undefined;
	hiddenModeIds?: ReadonlySet<string>;
	iconOnly?: boolean;
	onSelect: (modeId: string) => void;
}) {
	const { i18n, t } = useLingui();
	const { shown, select } = useOptimisticSelections({ mode: currentModeId });
	const shownModeId = shown("mode");
	const offeredModes = modes.filter((mode) => !hiddenModeIds.has(mode.id));
	if (offeredModes.length < 2) return null;

	const copyFor = (mode: SessionMode): ModeCopy => {
		const known = KNOWN_MODES[mode.id];
		return {
			...(known
				? {
						title: i18n._(known.title),
						description: i18n._(known.description),
						icon: known.icon,
					}
				: { title: mode.label, description: "", icon: SlidersHorizontal }),
			unrestricted: isUnrestrictedMode(mode.id),
		};
	};

	const current =
		modes.find((mode) => mode.id === shownModeId) ?? offeredModes[0];
	if (!current) return null;
	const currentCopy = copyFor(current);
	const CurrentIcon = currentCopy.icon;

	const iconProps = (copy: ModeCopy, className: string) => ({
		className: cn(
			"shrink-0 text-current",
			className,
			SOLID_ICONS.has(copy.icon) && "fill-current",
		),
		strokeWidth: SOLID_ICONS.has(copy.icon) ? 1 : 2,
	});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					className={cn(PILL_TRIGGER_CLASS, "group")}
					title={iconOnly ? currentCopy.title : undefined}
					type="button"
					data-footer-label
				>
					<CurrentIcon
						{...iconProps(
							currentCopy,
							cn("size-3.5", currentCopy.unrestricted && UNRESTRICTED_TINT),
						)}
					/>
					<span
						className={iconOnly ? "sr-only" : "truncate"}
						data-footer-label={iconOnly ? undefined : true}
					>
						{currentCopy.title}
					</span>
					<LuChevronDown className={PILL_CHEVRON_CLASS} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				aria-label={t({
					message: "How should the agent's actions be approved?",
				})}
				className={cn(MENU_PANEL_CLASS, "w-[300px] p-1.5")}
				side="top"
			>
				{offeredModes.map((mode) => {
					const copy = copyFor(mode);
					const Icon = copy.icon;
					const selected = mode.id === current.id;
					return (
						<DropdownMenuItem
							aria-current={selected ? "true" : undefined}
							className={cn(
								"items-start gap-3 rounded-[0.625rem] px-2.5 py-2 text-[13px]",
							)}
							key={mode.id}
							onSelect={() => {
								if (mode.id === shownModeId) return;
								select("mode", mode.id, () => onSelect(mode.id));
							}}
						>
							<span className="flex h-4 w-4 shrink-0 items-center justify-center">
								<Icon
									{...iconProps(
										copy,
										cn("size-4", copy.unrestricted && UNRESTRICTED_TINT),
									)}
								/>
							</span>
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate font-medium">{copy.title}</span>
								{copy.description ? (
									<span
										className={cn(
											MENU_DESCRIPTION_CLASS,
											"text-muted-foreground",
										)}
									>
										{copy.description}
									</span>
								) : null}
							</span>
							<span className="flex h-4 w-3.5 shrink-0 items-center justify-center">
								{selected ? (
									<LuCheck className="size-3.5 text-current" />
								) : null}
							</span>
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
