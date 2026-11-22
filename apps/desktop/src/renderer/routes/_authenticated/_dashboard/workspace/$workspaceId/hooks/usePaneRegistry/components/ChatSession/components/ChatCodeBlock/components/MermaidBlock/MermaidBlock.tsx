import { useLingui } from "@lingui/react/macro";
import {
	DiagramLightbox,
	MermaidDiagram,
	useMermaidDiagram,
} from "@superset/chat-ui/MermaidDiagram";
import { ViewToggle } from "@superset/chat-ui/ViewToggle";
import { cn } from "@superset/ui/utils";
import { CodeXml, Maximize2 } from "lucide-react";
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
 * A Mermaid fence draws once it has closed, on the reply itself with no card
 * around it. The code stays a toggle away in the usual card, and comes back
 * on its own when the diagram cannot be drawn.
 */
export function MermaidBlock({ fence, text }: { fence: Fence; text: string }) {
	const { t } = useLingui();
	const incomplete = useIsCodeFenceIncomplete();
	const [view, setView] = useState<View>("diagram");
	const [wrap, setWrap] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const diagram = useMermaidDiagram(incomplete ? null : text);
	const drawn = diagram.status === "ready" ? diagram.svg : null;
	const reason = diagram.status === "error" ? diagram.error : null;
	const expandLabel = t({ message: "Expand diagram" });
	const copyButton = (
		<CopyButton
			className={FENCE_BUTTON_CLASSNAME}
			iconClassName="size-3.5"
			label={t({ message: "Copy code" })}
			text={text}
		/>
	);
	const lightbox = expanded && drawn !== null && (
		<DiagramLightbox
			label={t({ message: "Diagram" })}
			onClose={() => setExpanded(false)}
			svg={drawn}
		/>
	);

	if (view === "diagram" && drawn !== null) {
		return (
			<div className="mb-2" data-chat-code-block="mermaid">
				<div className="flex items-center justify-end gap-1 pr-1.5">
					<FenceButton
						icon={CodeXml}
						label={t({ message: "Show code" })}
						onClick={() => setView("code")}
					/>
					<FenceButton
						icon={Maximize2}
						label={expandLabel}
						onClick={() => setExpanded(true)}
					/>
					{copyButton}
				</div>
				<MermaidDiagram
					className="py-1"
					label={expandLabel}
					onExpand={() => setExpanded(true)}
					svg={drawn}
				/>
				{lightbox}
			</div>
		);
	}

	return (
		<div className="mb-2" data-chat-code-block="mermaid">
			{reason !== null && (
				<pre className="mb-2 whitespace-pre-wrap font-mono text-destructive text-xs">
					{reason
						? t({ message: `Diagram could not be drawn: ${reason}` })
						: t({ message: "Diagram could not be drawn" })}
				</pre>
			)}
			<div className={cn("overflow-hidden", CODE_CARD_CLASSNAME)}>
				<FenceHeader
					actions={
						<>
							{drawn !== null && (
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
							<WrapLinesButton onChange={setWrap} wrap={wrap} />
							{copyButton}
						</>
					}
					fence={fence}
				/>
				<FenceCode fence={fence} text={text} wrap={wrap} />
			</div>
			{lightbox}
		</div>
	);
}
