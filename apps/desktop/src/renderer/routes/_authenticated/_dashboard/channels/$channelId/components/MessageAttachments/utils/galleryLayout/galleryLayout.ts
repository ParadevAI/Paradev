export interface Size {
	width: number;
	height: number;
}

type Orientation = "landscape" | "portrait" | "square";
type Breakpoint = "large" | "medium" | "small" | "tiny";

const MIN_SIDE = 108;
const GAP = 8;

/** Slack's tallest preview per gallery width and image shape. */
const MAX_HEIGHT: Record<Breakpoint, Record<Orientation, number>> = {
	large: { landscape: 235, portrait: 354, square: 314 },
	medium: { landscape: 154, portrait: 276, square: 206 },
	small: { landscape: 115, portrait: 206, square: 206 },
	tiny: { landscape: 115, portrait: 206, square: 154 },
};

const TILE_RATIO: Record<Orientation, number> = {
	landscape: 4 / 3,
	portrait: 3 / 4,
	square: 1,
};

function breakpoint(galleryWidth: number): Breakpoint {
	if (galleryWidth >= 636) return "large";
	if (galleryWidth >= 472) return "medium";
	if (galleryWidth >= 448) return "small";
	return "tiny";
}

function orientation({ width, height }: Size): Orientation {
	if (width > height) return "landscape";
	if (width < height) return "portrait";
	return "square";
}

function nonZero({ width, height }: Size): Size {
	return { width: Math.max(width, 1), height: Math.max(height, 1) };
}

/** How many images fit side by side before the rest fold into "+N". */
export function maxVisibleImages(galleryWidth: number): number {
	if (galleryWidth >= 600) return 4;
	if (galleryWidth >= 448) return 3;
	if (galleryWidth >= 224) return 2;
	return 1;
}

/** One image: never upscaled, capped by the gallery width and a per-shape height, at least 108px a side. */
export function singleImageSize(galleryWidth: number, natural: Size): Size {
	const { width, height } = nonZero(natural);
	const ratio = width / height;
	const maxHeight = MAX_HEIGHT[breakpoint(galleryWidth)][orientation(natural)];
	let boxWidth = Math.max(Math.min(width, galleryWidth), MIN_SIDE);
	const boxHeight = Math.max(
		Math.floor(Math.min(boxWidth / ratio, maxHeight, height)),
		MIN_SIDE,
	);
	boxWidth = Math.max(
		Math.min(Math.floor(boxHeight * ratio), boxWidth),
		MIN_SIDE,
	);
	return { width: boxWidth, height: boxHeight };
}

/** Two images share one row height; widths split what is left by each one's extra width. */
export function pairImageSizes(galleryWidth: number, naturals: Size[]): Size[] {
	const sizes = naturals.map(nonZero);
	const count = sizes.length;
	const available = galleryWidth - (count - 1) * GAP;
	const heights = sizes.map(({ width, height }) =>
		width < MIN_SIDE
			? Math.max((MIN_SIDE * height) / width, MIN_SIDE)
			: Math.max(height, MIN_SIDE),
	);
	const tallest = heights.indexOf(Math.max(...heights));
	const tallestSize = sizes[tallest] ?? { width: 1, height: 1 };
	const cap = Math.min(
		heights[tallest] ?? MIN_SIDE,
		MAX_HEIGHT[breakpoint(galleryWidth)][
			orientation({
				width: Math.max(tallestSize.width, MIN_SIDE),
				height: Math.max(tallestSize.height, MIN_SIDE),
			})
		],
	);
	const wanted = sizes.map(({ width, height }) =>
		Math.min(cap * (width / height), width),
	);
	const extra = wanted.map((width) => Math.max(width - MIN_SIDE, 0));
	const extraTotal = extra.reduce((sum, value) => sum + value, 0);
	const room = Math.min(available - MIN_SIDE * count, extraTotal);
	const widths = extra.map((value) =>
		extraTotal <= 0 || room <= 0
			? MIN_SIDE
			: Math.floor(MIN_SIDE + (value / extraTotal) * room),
	);
	const rowHeight = Math.max(
		...sizes.map(({ width, height }, index) =>
			Math.min((widths[index] ?? MIN_SIDE) / (width / height), height, cap),
		),
		MIN_SIDE,
	);
	return widths.map((width) => ({ width, height: rowHeight }));
}

/** Three or more: equal-height tiles cropped to 4:3, 3:4 or square, as many as fit. */
export function tileImageSizes(galleryWidth: number, naturals: Size[]): Size[] {
	const visible = naturals.slice(0, maxVisibleImages(galleryWidth));
	const ratios = visible.map((size) => TILE_RATIO[orientation(nonZero(size))]);
	const ratioTotal = ratios.reduce((sum, value) => sum + value, 0);
	const available = galleryWidth - (visible.length - 1) * GAP;
	const height = ratioTotal > 0 ? available / ratioTotal : 0;
	return ratios.map((ratio) => ({
		width: Math.floor(ratio * height),
		height: Math.floor(height),
	}));
}

export function galleryLayout(galleryWidth: number, naturals: Size[]): Size[] {
	if (naturals.length === 0) return [];
	const [first] = naturals;
	if (naturals.length === 1 && first) {
		return [singleImageSize(galleryWidth, first)];
	}
	if (naturals.length === 2) return pairImageSizes(galleryWidth, naturals);
	return tileImageSizes(galleryWidth, naturals);
}
