import { useLingui } from "@lingui/react/macro";
import type { MachineSize } from "@superset/shared/billing";
import { ContextMenuItem } from "@superset/ui/context-menu";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { LuCheck } from "react-icons/lu";
import { useChangeMachineSize } from "renderer/routes/_authenticated/hooks/useChangeMachineSize";
import { useResizeMachineConfirmStore } from "renderer/stores/resize-machine-confirm";

const ITEMS = { context: ContextMenuItem, dropdown: DropdownMenuItem } as const;

/** The org's machine sizes as menu items. Picking one asks to confirm, since a running box restarts. */
export function MachineSizeMenuItems({
	workspaceId,
	menu,
	suggestedSize = null,
}: {
	workspaceId: string;
	menu: keyof typeof ITEMS;
	suggestedSize?: MachineSize | null;
}) {
	const { t } = useLingui();
	const Item = ITEMS[menu];
	const { options, currentSize, isResizing } =
		useChangeMachineSize(workspaceId);
	const requestConfirm = useResizeMachineConfirmStore((state) => state.request);

	return options.map((option) => (
		<Item
			key={option.size}
			disabled={isResizing}
			onSelect={() => {
				if (option.size !== currentSize)
					requestConfirm(workspaceId, option.size);
			}}
			className="gap-2"
		>
			<LuCheck
				className={option.size === currentSize ? "size-4" : "size-4 invisible"}
			/>
			<span className="flex-1">{option.name}</span>
			{option.size === suggestedSize ? (
				<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
					{t({ message: "Suggested", context: "machine size" })}
				</span>
			) : null}
			<span className="text-xs text-muted-foreground">{option.spec}</span>
		</Item>
	));
}
