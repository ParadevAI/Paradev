export type SvgSize = { width: number; height: number };

const VIEW_BOX =
	/viewBox="\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/;
const FALLBACK: SvgSize = { width: 800, height: 600 };

/** The drawing's own size, read from its viewBox. */
export function svgSize(svg: string): SvgSize {
	const match = VIEW_BOX.exec(svg);
	const width = Number(match?.[1]);
	const height = Number(match?.[2]);
	return width > 0 && height > 0 ? { width, height } : FALLBACK;
}
