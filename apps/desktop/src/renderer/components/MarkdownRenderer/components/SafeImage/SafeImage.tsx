import { Trans, useLingui } from "@lingui/react/macro";
import { type CSSProperties, useState } from "react";
import { LuImageOff } from "react-icons/lu";
import { useMarkdownResources } from "renderer/components/MarkdownRenderer/providers/MarkdownResourceProvider";
import { useLocalImageUrl } from "./hooks/useLocalImageUrl";
import { resolveLocalImagePath } from "./utils/resolveLocalImagePath";

/**
 * Sources an <img> may load as-is: embedded data URLs and web URLs.
 * Cleartext http only for markdown on disk — from a PR comment it would let
 * a stranger make this app GET localhost or LAN services, which https can't
 * reach; for your own files it's a dev server's screenshot.
 *
 * Every other source — relative, absolute, file: — names a file, which
 * only means something when the markdown itself is a file on disk. Those
 * go through the workspace filesystem (see MarkdownResourceProvider), never
 * the DOM: a relative URL here would resolve against the renderer's own
 * document, and a cloud workspace's files aren't on this machine at all.
 */
function loadsDirectly(src: string, fromDisk: boolean): boolean {
	const lower = src.trim().toLowerCase();
	return (
		lower.startsWith("data:") ||
		lower.startsWith("https://") ||
		(fromDisk && lower.startsWith("http://"))
	);
}

export type ImageAlignment = "top" | "middle" | "bottom" | "left" | "right";

/** The HTML `align` attribute as GitHub lays it out: a float with a gutter, or a vertical alignment. */
function alignmentStyle(align: ImageAlignment | undefined): CSSProperties {
	switch (align) {
		case "left":
			return { float: "left", paddingRight: 20 };
		case "right":
			return { float: "right", paddingLeft: 20 };
		case "top":
		case "middle":
		case "bottom":
			return { verticalAlign: align };
		default:
			return {};
	}
}

/**
 * The markup's size hints as inline styles. Stylesheets set images to an
 * automatic height, which would beat the `height` attribute and render a
 * height-only badge at its natural size; an inline style beats them.
 */
function hintStyle(
	height: number | string | undefined,
	align: ImageAlignment | undefined,
): CSSProperties | undefined {
	const style = alignmentStyle(align);
	if (height !== undefined && height !== "") {
		style.height =
			typeof height === "string" && /^\d+$/.test(height)
				? Number(height)
				: height;
	}
	return Object.keys(style).length > 0 ? style : undefined;
}

interface SafeImageProps {
	src?: string;
	alt?: string;
	/** The markup's own size and alignment hints, which badges and icons in GitHub bodies rely on. */
	width?: number | string;
	height?: number | string;
	align?: ImageAlignment;
	className?: string;
}

export function SafeImage({
	src,
	alt,
	width,
	height,
	align,
	className,
}: SafeImageProps) {
	const { t } = useLingui();
	const resources = useMarkdownResources();
	const localPath =
		resources && src ? resolveLocalImagePath(src, resources) : null;
	const local = useLocalImageUrl(
		localPath,
		resources?.readFile,
		resources?.revision,
	);
	// Bytes that arrived but aren't an image (an HTML file named .png, a
	// text file, an empty file) would otherwise sit there as a broken icon.
	const [undecodableUrl, setUndecodableUrl] = useState<string | null>(null);
	const imageClassName = className ?? "max-w-full h-auto rounded-md my-4";

	if (localPath !== null) {
		if (local.status === "loading") return null;
		if (local.status === "ready" && local.url !== undecodableUrl) {
			return (
				<img
					src={local.url}
					alt={alt}
					width={width}
					height={height}
					style={hintStyle(height, align)}
					className={imageClassName}
					onError={() => setUndecodableUrl(local.url)}
				/>
			);
		}
	} else if (src && loadsDirectly(src, resources !== null)) {
		return (
			<img
				src={src}
				alt={alt}
				width={width}
				height={height}
				style={hintStyle(height, align)}
				className={imageClassName}
			/>
		);
	}

	const failedToLoad = localPath !== null;
	return (
		<div
			className={`inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-muted-foreground text-sm ${className ?? ""}`}
			title={
				failedToLoad
					? localPath
					: t({ message: `Image blocked: ${src ?? "(empty)"}` })
			}
		>
			<LuImageOff className="w-4 h-4 flex-shrink-0" />
			<span className="truncate max-w-[300px]">
				{failedToLoad ? (
					<Trans>Could not load image</Trans>
				) : (
					<Trans>Image blocked</Trans>
				)}
			</span>
		</div>
	);
}
