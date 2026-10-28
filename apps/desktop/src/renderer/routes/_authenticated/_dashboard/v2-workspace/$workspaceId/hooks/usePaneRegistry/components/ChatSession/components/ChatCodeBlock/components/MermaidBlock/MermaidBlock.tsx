import { useLingui } from "@lingui/react/macro";
import {
	DiagramLightbox,
	MermaidDiagram,
	useMermaidDiagram,
} from "@superset/chat-ui/MermaidDiagram";
import { ViewToggle } from "@superset/chat-ui/ViewToggle";
import { cn } from "@superset/ui/utils";
import { Maximize2 } from "lucide-react";
import { useState } from "react";
import { useIsCodeFenceIncomplete } from "streamdown";
import { CopyButton } from "../../../CopyButton";
import { CODE_CARD_CLASSNAME, FENCE_BUTTON_CLASSNAME } from "../../constants";
import type { Fence } from "../../utils/fencedCode";
import { FenceButton } from "../FenceButton";
import { FenceCode } from "../FenceCode";
import { FenceHeader } from "../FenceHeader";
import { WrapLinesButton } from "../WrapLinesButton";

type View = "diagram" | "code";

/**
 * A Mermaid fence draws once it has closed. The code stays a toggle away,
 * and comes back on its own when the diagram cannot be drawn.
 */
export function MermaidBlock({ fence, text }: { fence: Fence; text: string }) {
	const { t } = useLingui();
	const incomplete = useIsCodeFenceIncomplete();
	const [view, setView] = useState<View>("diagram");
	const [wrap, setWrap] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const diagram = useMermaidDiagram(incomplete ? null : text);
	const drawn = diagram.status === "ready" ? diagram.svg : null;
	const failed = diagram.status === "error";
	const reason = failed ? diagram.error : "";
	const showDiagram = view === "diagram" && drawn !== null;
	const expandLabel = t({ message: "Expand diagram" });
	return (
		<div
			className={cn("mb-2 overflow-hidden", CODE_CARD_CLASSNAME)}
			data-chat-code-block="mermaid"
		>
			<FenceHeader
				actions={
					<>
						{!incomplete && !failed && (
							<ViewToggle
								label={t({ message: "View" })}
								onChange={setView}
								options={[
									{ value: "code", label: t({ message: "Code" }) },
									{ value: "diagram", label: t({ message: "Diagram" }) },
								]}
								value={view}
							/>
						)}
						{showDiagram ? (
							<FenceButton
								icon={Maximize2}
								label={expandLabel}
								onClick={() => setExpanded(true)}
							/>
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
			{failed && (
				<p className="truncate px-3 pb-2 text-destructive text-xs">
					{reason
						? t({ message: `Diagram could not be drawn: ${reason}` })
						: t({ message: "Diagram could not be drawn" })}
				</p>
			)}
			{showDiagram ? (
				<MermaidDiagram
					label={expandLabel}
					onExpand={() => setExpanded(true)}
					svg={drawn}
				/>
			) : (
				<FenceCode fence={fence} text={text} wrap={wrap} />
			)}
			{expanded && drawn !== null && (
				<DiagramLightbox
					label={t({ message: "Diagram" })}
					onClose={() => setExpanded(false)}
					svg={drawn}
				/>
			)}
		</div>
	);
}
