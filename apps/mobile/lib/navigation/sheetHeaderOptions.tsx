import { SheetHeader } from "./components/SheetHeader";
import type { SheetHeaderOptions } from "./sheetHeaderOptions.types";

/** A form sheet draws no native bar here, so the header is drawn in JS. */
export const sheetHeaderOptions: SheetHeaderOptions = {
	headerShown: true,
	sheetCornerRadius: 28,
	header: (props) => <SheetHeader {...props} />,
};
