import { Portal } from "@rn-primitives/portal";
import { useRoute } from "expo-router";
import { isWebSheet } from "../../utils/isWebSheet";
import { sheetHeaderHostName } from "./hostName";
import type { SheetHeaderSlotComponent } from "./SheetHeaderSlot.types";

/** The stack renders a sheet's header above the page; it moves into the sheet's dialog. */
export const SheetHeaderSlot: SheetHeaderSlotComponent = ({
	options,
	children,
}) => {
	const route = useRoute();
	if (!isWebSheet(options)) return children;
	const hostName = sheetHeaderHostName(route.key);
	return (
		<Portal name={hostName} hostName={hostName}>
			{children}
		</Portal>
	);
};
