import type { SheetScreenOptions } from "./sheetScreenOptions.types";

export const sheetScreenOptions: SheetScreenOptions = (options) => ({
	presentation: "formSheet",
	...options,
});
