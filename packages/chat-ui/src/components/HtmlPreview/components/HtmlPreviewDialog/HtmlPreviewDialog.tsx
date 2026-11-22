import { useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalOverlay } from "../../../../hooks/useModalOverlay";
import { OverlayButton } from "../../../OverlayButton";
import { HtmlPreviewFrame } from "../../HtmlPreviewFrame";
import type { PreviewZoom } from "../../utils/previewZoom";
import { ZoomMenu } from "../ZoomMenu";

/** The page across the whole window, with its own zoom. Escape closes, from the page too. */
export function HtmlPreviewDialog({
	initialZoom = "fit",
	onClose,
	src,
	title,
}: {
	src: string;
	title: string;
	onClose: () => void;
	initialZoom?: PreviewZoom;
}) {
	const { t } = useLingui();
	const dialogRef = useRef<HTMLDivElement>(null);
	const [zoom, setZoom] = useState<PreviewZoom>(initialZoom);

	useModalOverlay(dialogRef, onClose);

	return createPortal(
		<div
			aria-label={title}
			aria-modal="true"
			className="fixed inset-0 z-[100] flex flex-col bg-black/85 p-4 outline-none"
			ref={dialogRef}
			role="dialog"
			tabIndex={-1}
		>
			<div className="mb-3 flex items-center justify-between gap-3 text-white">
				<span className="truncate text-sm">{title}</span>
				<div className="flex shrink-0 items-center gap-2">
					<ZoomMenu
						className="h-9 rounded-full bg-white/10 px-3 text-white hover:bg-white/20"
						onChange={setZoom}
						zoom={zoom}
					/>
					<OverlayButton aria-label={t({ message: "Close" })} onClick={onClose}>
						<X className="size-4" />
					</OverlayButton>
				</div>
			</div>
			<HtmlPreviewFrame
				className="min-h-0 flex-1 rounded-lg"
				fill
				onEscape={onClose}
				src={src}
				title={title}
				zoom={zoom}
			/>
		</div>,
		document.body,
	);
}
