import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import {
	isPreviewEscape,
	PREVIEW_MAX_HEIGHT,
	PREVIEW_MIN_HEIGHT,
	PREVIEW_SANDBOX,
	type PreviewSize,
	readPreviewSize,
} from "./utils/previewDocument";
import { type PreviewZoom, previewScale } from "./utils/previewZoom";

const DEFAULT_HEIGHT = 240;

/**
 * A page at `src`, built with `previewDocument`, in a sandboxed frame: an
 * opaque origin with no network. Zoomed out, the frame is laid out wider and
 * scaled down, so the page gets the width it asks for and still fits.
 */
export function HtmlPreviewFrame({
	className,
	fill = false,
	onEscape,
	src,
	title,
	zoom,
}: {
	src: string;
	title: string;
	zoom: PreviewZoom;
	/** Take the parent's height instead of the page's own. */
	fill?: boolean;
	/** Escape pressed inside the page. */
	onEscape?: () => void;
	className?: string;
}) {
	const boxRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<HTMLIFrameElement>(null);
	const onEscapeRef = useRef(onEscape);
	useEffect(() => {
		onEscapeRef.current = onEscape;
	}, [onEscape]);
	const [box, setBox] = useState({ width: 0, height: 0 });
	const [page, setPage] = useState<PreviewSize | null>(null);

	useEffect(() => {
		const element = boxRef.current;
		if (!element) return;
		const measure = () =>
			setBox({ width: element.clientWidth, height: element.clientHeight });
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== frameRef.current?.contentWindow) return;
			if (isPreviewEscape(event.data)) {
				onEscapeRef.current?.();
				return;
			}
			const size = readPreviewSize(event.data);
			if (!size) return;
			// A page that once overflowed keeps that width: laid out wider to fit,
			// it no longer overflows, and forgetting would make fit flip back and forth.
			setPage((current) => {
				const width = size.width > 0 ? size.width : (current?.width ?? 0);
				return current?.width === width && current.height === size.height
					? current
					: { width, height: size.height };
			});
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	const scale = previewScale(zoom, box.width, page?.width || null);
	const pageHeight = Math.min(
		PREVIEW_MAX_HEIGHT,
		Math.max(PREVIEW_MIN_HEIGHT, page?.height ?? DEFAULT_HEIGHT),
	);
	const height = fill ? box.height : pageHeight * scale;
	return (
		<div
			className={cn(
				"relative w-full overflow-hidden bg-white",
				fill && "h-full",
				className,
			)}
			ref={boxRef}
			style={fill ? undefined : { height }}
		>
			<iframe
				className="absolute top-0 left-0 border-0 bg-white"
				loading="lazy"
				ref={frameRef}
				referrerPolicy="no-referrer"
				sandbox={PREVIEW_SANDBOX}
				src={src}
				style={{
					width: box.width / scale,
					height: height / scale,
					transform: `scale(${scale})`,
					transformOrigin: "top left",
				}}
				title={title}
			/>
		</div>
	);
}
