export interface Point {
	x: number;
	y: number;
}

// Standard same-sign point-in-triangle test via cross-product signs.
function triangleSign(p1: Point, p2: Point, p3: Point): number {
	return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

function isPointInTriangle(pt: Point, a: Point, b: Point, c: Point): boolean {
	const d1 = triangleSign(pt, a, b);
	const d2 = triangleSign(pt, b, c);
	const d3 = triangleSign(pt, c, a);
	const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
	const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
	return !(hasNegative && hasPositive);
}

// The two corners of the card's near edge — the base of the safe triangle.
// The card is configured to render on the sidebar's right (side="right"),
// but Radix's collision avoidance (on by default; this popover doesn't
// disable it) can flip that to the left if there's more room there — a
// resizable sidebar dragged wide enough, or a narrow window, can trigger it.
// Read the resolved side straight off the element rather than assuming.
function getNearCardCorners(
	cardElement: HTMLElement,
	cardRect: DOMRect,
): [Point, Point] {
	const x =
		cardElement.getAttribute("data-side") === "left"
			? cardRect.right
			: cardRect.left;
	return [
		{ x, y: cardRect.top },
		{ x, y: cardRect.bottom },
	];
}

// Re-derives the triangle's base from the card's *current* rect on every
// call rather than a rect captured once when tracking started — the open
// card's bounds can keep changing after that (its CSS entrance transition,
// or content resizing as async data like diff stats loads in).
export function isPointInsideCardCone(
	point: Point,
	apex: Point,
	cardElement: HTMLElement | null,
): boolean {
	if (!cardElement) return false;
	const [cornerA, cornerB] = getNearCardCorners(
		cardElement,
		cardElement.getBoundingClientRect(),
	);
	return isPointInTriangle(point, apex, cornerA, cornerB);
}
