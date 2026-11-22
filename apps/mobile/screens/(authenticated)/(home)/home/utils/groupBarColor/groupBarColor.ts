/** A desktop folder colour Home can draw: a hex value, else none. */
export function groupBarColor(color: string | null | undefined): string | null {
	return color?.startsWith("#") ? color : null;
}
