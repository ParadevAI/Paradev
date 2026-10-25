import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { Fragment } from "react";
import { getRightPaneOptions, type RightPaneGates } from "../../paneOptions";
import type { RightPaneKind } from "../../types";

interface RightPaneAddMenuProps {
	onAdd: (kind: RightPaneKind) => void;
	runAfterClose: (action: () => void) => void;
	gates: RightPaneGates;
}

export function RightPaneAddMenu({
	onAdd,
	runAfterClose,
	gates,
}: RightPaneAddMenuProps) {
	const { i18n } = useLingui();
	const options = getRightPaneOptions(gates);

	return (
		<>
			{options.map((option, index) => {
				const previous = options[index - 1];
				const open = () =>
					option.kind === "terminal"
						? runAfterClose(() => onAdd(option.kind))
						: onAdd(option.kind);
				return (
					<Fragment key={option.kind}>
						{previous && previous.group !== option.group && (
							<DropdownMenuSeparator />
						)}
						<DropdownMenuItem className="gap-2" onClick={open}>
							<option.Icon className="size-4" />
							<span>{i18n._(option.label)}</span>
						</DropdownMenuItem>
					</Fragment>
				);
			})}
		</>
	);
}
