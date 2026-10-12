import { SafeImage } from "renderer/components/MarkdownRenderer/components";
import type { ImageAlignment } from "renderer/components/MarkdownRenderer/components/SafeImage/SafeImage";
import { useTheme } from "renderer/stores";

interface MarkupNode {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: MarkupNode[];
}

const IMAGE_ALIGNMENTS: ReadonlySet<string> = new Set([
	"top",
	"middle",
	"bottom",
	"left",
	"right",
]);

export function imageAlignment(value: unknown): ImageAlignment | undefined {
	return typeof value === "string" && IMAGE_ALIGNMENTS.has(value)
		? (value as ImageAlignment)
		: undefined;
}

function firstCandidate(srcSet: unknown): string | undefined {
	const raw = Array.isArray(srcSet) ? srcSet[0] : srcSet;
	if (typeof raw !== "string") return undefined;
	return raw.split(",")[0]?.trim().split(/\s+/)[0] || undefined;
}

interface PullRequestPictureProps {
	node?: MarkupNode;
}

/**
 * Bots ship a light and a dark badge behind `<picture>` sources keyed on
 * `prefers-color-scheme`. The browser answers that query from the OS, not
 * from the app's theme, so the source is picked here by the theme in use.
 */
export function PullRequestPicture({ node }: PullRequestPictureProps) {
	const theme = useTheme();
	const scheme = theme?.type === "light" ? "light" : "dark";
	const elements = (node?.children ?? []).filter(
		(child) => child.type === "element",
	);
	const image = elements.find((child) => child.tagName === "img");
	const source = elements.find(
		(child) =>
			child.tagName === "source" &&
			String(child.properties?.media ?? "").includes(
				`prefers-color-scheme: ${scheme}`,
			),
	);
	const src =
		firstCandidate(source?.properties?.srcSet) ??
		(typeof image?.properties?.src === "string"
			? image.properties.src
			: undefined);
	if (!src) return null;
	const properties = image?.properties ?? {};
	return (
		<SafeImage
			src={src}
			alt={typeof properties.alt === "string" ? properties.alt : ""}
			width={properties.width as number | string | undefined}
			height={properties.height as number | string | undefined}
			align={imageAlignment(properties.align)}
		/>
	);
}
