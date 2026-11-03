const OPTIONS = {
	USE_PROFILES: { svg: true, svgFilters: true },
	FORBID_TAGS: ["a", "foreignObject", "image", "script", "style"],
	FORBID_ATTR: ["href", "src", "srcset", "xlink:href"],
};

/** Keeps a drawing to shapes and text: nothing in it can navigate, load or run. */
export async function sanitizeSvg(svg: string): Promise<string> {
	const { default: DOMPurify } = await import("dompurify");
	return DOMPurify.sanitize(svg, OPTIONS);
}
