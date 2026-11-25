import type { SheetScreenOptions } from "./sheetScreenOptions.types";

/** The web stack shows the screen below only under a transparent modal; `WebScreen` draws the sheet and its header. */
export const sheetScreenOptions: SheetScreenOptions = (options) => ({
	...options,
	presentation: "transparentModal",
	headerShown: false,
	contentStyle: { backgroundColor: "transparent" },
	sheetAllowedDetents: options.sheetAllowedDetents ?? [1.0],
});
