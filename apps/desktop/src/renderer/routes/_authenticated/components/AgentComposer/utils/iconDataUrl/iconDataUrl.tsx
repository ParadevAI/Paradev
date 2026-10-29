import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export function iconDataUrl(
	Icon: ComponentType<{ color?: string; size?: number | string }>,
	color: string,
): string {
	const svg = renderToStaticMarkup(<Icon color={color} />);
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
