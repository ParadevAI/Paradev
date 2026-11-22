import type { ComponentProps, ReactNode } from "react";
import { useMemo } from "react";
import { HtmlPreviewBlock } from "./components/HtmlPreviewBlock";
import { MermaidBlock } from "./components/MermaidBlock";
import { PlainCodeBlock } from "./components/PlainCodeBlock";
import { fenceInfo, fenceText, parseFence } from "./utils/fencedCode";

type FencedCodeProps = ComponentProps<"code"> & {
	node?: unknown;
	children?: ReactNode;
};

/**
 * A fenced block in agent prose. Mermaid draws, HTML shows as a page, and
 * every other fence shows as code.
 */
export function ChatCodeBlock({ children, className }: FencedCodeProps) {
	const fence = useMemo(() => parseFence(fenceInfo(className)), [className]);
	const text = useMemo(() => fenceText(children), [children]);
	if (fence.language === "mermaid") {
		return <MermaidBlock fence={fence} text={text} />;
	}
	if (fence.language === "html") {
		return <HtmlPreviewBlock fence={fence} text={text} />;
	}
	return <PlainCodeBlock fence={fence} text={text} />;
}
