import { useLingui } from "@lingui/react/macro";
import {
	HtmlPreviewDialog,
	HtmlPreviewFrame,
	type PreviewZoom,
	previewDocument,
	ZoomMenu,
} from "@superset/chat-ui/HtmlPreview";
import { ViewToggle } from "@superset/chat-ui/ViewToggle";
import { htmlPreviewUrl } from "@superset/shared/html-preview";
import { cn } from "@superset/ui/utils";
import { Maximize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useIsCodeFenceIncomplete } from "streamdown";
import { CopyButton } from "../../../CopyButton";
import { CODE_CARD_CLASSNAME, FENCE_BUTTON_CLASSNAME } from "../../constants";
import type { Fence } from "../../utils/fencedCode";
import { FenceButton } from "../FenceButton";
import { FenceCode } from "../FenceCode";
import { FenceHeader } from "../FenceHeader";
import { WrapLinesButton } from "../WrapLinesButton";

type View = "preview" | "code";

/**
 * An HTML fence shows as the page it describes once it has closed, in a
 * frame of its own. The code stays a toggle away.
 */
export function HtmlPreviewBlock({
	fence,
	text,
}: {
	fence: Fence;
	text: string;
}) {
	const { t } = useLingui();
	const incomplete = useIsCodeFenceIncomplete();
	const [view, setView] = useState<View>("preview");
	const [zoom, setZoom] = useState<PreviewZoom>("fit");
	const [wrap, setWrap] = useState(false);
	const [fullScreen, setFullScreen] = useState(false);
	const showPreview = view === "preview" && !incomplete;
	const src = useMemo(
		() => (incomplete ? null : htmlPreviewUrl(previewDocument(text))),
		[incomplete, text],
	);
	const title = fence.file?.fileName ?? t({ message: "HTML preview" });
	return (
		<div
			className={cn("mb-2 overflow-hidden", CODE_CARD_CLASSNAME)}
			data-chat-code-block="html"
		>
			<FenceHeader
				actions={
					<>
						{!incomplete && (
							<ViewToggle
								label={t({ message: "View" })}
								onChange={setView}
								options={[
									{ value: "code", label: t({ message: "Code" }) },
									{ value: "preview", label: t({ message: "Preview" }) },
								]}
								value={view}
							/>
						)}
						{showPreview ? (
							<>
								<ZoomMenu
									className={FENCE_BUTTON_CLASSNAME}
									onChange={setZoom}
									zoom={zoom}
								/>
								<FenceButton
									icon={Maximize2}
									label={t({ message: "Open full screen" })}
									onClick={() => setFullScreen(true)}
								/>
							</>
						) : (
							<WrapLinesButton onChange={setWrap} wrap={wrap} />
						)}
						<CopyButton
							className={FENCE_BUTTON_CLASSNAME}
							iconClassName="size-3.5"
							label={t({ message: "Copy code" })}
							text={text}
						/>
					</>
				}
				fence={fence}
			/>
			{showPreview && src !== null ? (
				<HtmlPreviewFrame src={src} title={title} zoom={zoom} />
			) : (
				<FenceCode fence={fence} text={text} wrap={wrap} />
			)}
			{fullScreen && src !== null && (
				<HtmlPreviewDialog
					initialZoom={zoom}
					onClose={() => setFullScreen(false)}
					src={src}
					title={title}
				/>
			)}
		</div>
	);
}
