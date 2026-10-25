import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { getRightPaneOptions, type RightPaneGates } from "../../paneOptions";
import type { RightPaneKind } from "../../types";

interface RightPaneEmptyStateProps {
	onAdd: (kind: RightPaneKind) => void;
	gates: RightPaneGates;
}

export function RightPaneEmptyState({
	onAdd,
	gates,
}: RightPaneEmptyStateProps) {
	const { i18n } = useLingui();

	return (
		<div className="flex flex-col items-center gap-3 p-4">
			<p className="text-sm text-muted-foreground">
				<Trans>Open a pane, or drag one here from the center.</Trans>
			</p>
			<div className="grid grid-cols-2 gap-2">
				{getRightPaneOptions(gates).map((option) => (
					<Button
						key={option.kind}
						variant="outline"
						size="sm"
						className="justify-start"
						onClick={() => onAdd(option.kind)}
					>
						<option.Icon className="size-4" />
						{i18n._(option.label)}
					</Button>
				))}
			</div>
		</div>
	);
}
