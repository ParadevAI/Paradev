import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useId } from "react";
import { useAvailableRailDestinationIds } from "renderer/routes/_authenticated/_dashboard/components/NavigationRail/hooks/useRailDestinations";
import { RAIL_DESTINATION_LABELS } from "renderer/routes/_authenticated/_dashboard/components/NavigationRail/railDestinationLabels";
import { useRailPinsStore } from "renderer/routes/_authenticated/_dashboard/components/NavigationRail/stores/railPinsStore";

export function SidebarSections() {
	const headingId = useId();
	const { i18n } = useLingui();
	const destinationIds = useAvailableRailDestinationIds();
	const hiddenDestinationIds = useRailPinsStore(
		(state) => state.hiddenDestinationIds,
	);
	const setDestinationVisible = useRailPinsStore(
		(state) => state.setDestinationVisible,
	);

	return (
		<section
			aria-labelledby={headingId}
			className="rounded-lg border border-border"
		>
			<h3 id={headingId} className="px-4 pt-4 text-sm font-medium">
				<Trans>Sidebar sections</Trans>
			</h3>
			<div className="divide-y divide-border px-4 py-2">
				{destinationIds.map((id) => {
					const inputId = `${headingId}-${id}`;
					return (
						<div
							key={id}
							className="flex items-center justify-between gap-4 py-2"
						>
							<Label htmlFor={inputId} className="text-sm font-normal">
								{i18n._(RAIL_DESTINATION_LABELS[id])}
							</Label>
							<Switch
								id={inputId}
								checked={!hiddenDestinationIds.includes(id)}
								onCheckedChange={(visible) =>
									setDestinationVisible(id, visible)
								}
							/>
						</div>
					);
				})}
			</div>
		</section>
	);
}
