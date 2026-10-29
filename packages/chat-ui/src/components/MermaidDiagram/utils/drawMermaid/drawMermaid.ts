/** Labels are measured in the font the page draws them with. */
function pageFonts() {
	if (typeof document === "undefined") return {};
	return {
		fontFamily: getComputedStyle(document.body).fontFamily || undefined,
		fontFamilyMono:
			getComputedStyle(document.documentElement)
				.getPropertyValue("--font-mono")
				.trim() || undefined,
	};
}

/** Loads the renderer and the one diagram type on first use: most replies need neither. */
export async function drawMermaid(source: string): Promise<string> {
	const { renderAsync } = await import("pele/lazy");
	const { svg } = await renderAsync(source, {
		...pageFonts(),
		autoDirection: false,
		images: false,
		links: false,
	});
	return svg;
}
