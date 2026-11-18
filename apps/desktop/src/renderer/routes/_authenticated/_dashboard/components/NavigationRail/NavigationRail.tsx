import { useLingui } from "@lingui/react/macro";
import { TbSmartHome } from "react-icons/tb";
import { UpdatesPill } from "renderer/components/UpdatesPill";
import { ParadevAnywhereButton } from "renderer/routes/_authenticated/_dashboard/components/ParadevAnywhereButton";
import { RailButton } from "renderer/routes/_authenticated/_dashboard/components/RailButton";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { useDashboardNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDashboardNavigation";
import { PinnableRailButton } from "./components/PinnableRailButton";
import { RailMoreMenu } from "./components/RailMoreMenu";
import { RailUsage } from "./components/RailUsage";
import { useRailDestinations } from "./hooks/useRailDestinations";

export const NAVIGATION_RAIL_WIDTH = 52;

/** The window's left column: one icon per section, with updates and the account at the foot. */
export function NavigationRail() {
	const { t } = useLingui();
	const navigation = useDashboardNavigation();
	const destinations = useRailDestinations(navigation);

	return (
		<nav
			aria-label={t({ message: "Sections" })}
			className="flex shrink-0 flex-col items-center gap-1.5 pt-1 pb-2"
			style={{ width: NAVIGATION_RAIL_WIDTH }}
		>
			<RailButton
				label={t({ message: "Home" })}
				icon={TbSmartHome}
				isActive={navigation.isHomeOpen}
				onClick={navigation.openHome}
			/>
			{destinations
				.filter((destination) => destination.isPinned || destination.isActive)
				.map((destination) => (
					<PinnableRailButton key={destination.id} destination={destination} />
				))}
			<RailMoreMenu
				destinations={destinations}
				isActive={
					navigation.isChannelsOpen &&
					!destinations.some((destination) => destination.id === "chat")
				}
			/>
			<div className="mt-auto flex flex-col items-center gap-1.5">
				<RailUsage />
				<ParadevAnywhereButton variant="rail" />
				<UpdatesPill isCollapsed />
				<OrganizationDropdown variant="rail" />
			</div>
		</nav>
	);
}
