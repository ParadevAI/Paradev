import { cn } from "@superset/ui/utils";
import { useRef } from "react";
import type { Components } from "react-markdown";
import { useMarkdownStyle } from "renderer/stores";
import { SelectionContextMenu } from "./components";
import { defaultConfig } from "./styles/default/config";
import { tufteConfig } from "./styles/tufte/config";
import { renderMarkdown } from "./utils/renderMarkdown";

const styleConfigs = {
	default: defaultConfig,
	tufte: tufteConfig,
} as const;

const mergedComponents = new WeakMap<
	Partial<Components>,
	WeakMap<Partial<Components>, Partial<Components>>
>();

function withComponents(
	base: Partial<Components>,
	extra: Partial<Components> | undefined,
): Partial<Components> {
	if (!extra) return base;
	let byExtra = mergedComponents.get(base);
	if (!byExtra) {
		byExtra = new WeakMap();
		mergedComponents.set(base, byExtra);
	}
	let merged = byExtra.get(extra);
	if (!merged) {
		merged = { ...base, ...extra };
		byExtra.set(extra, merged);
	}
	return merged;
}

interface MarkdownRendererProps {
	content: string;
	style?: keyof typeof styleConfigs;
	className?: string;
	/** Parse raw inline HTML. Disable for remote/untrusted content (e.g. server-driven notices). */
	allowHtml?: boolean;
	/** Element renderers layered over the style's own. */
	components?: Partial<Components>;
}

export function MarkdownRenderer({
	content,
	style: styleProp,
	className,
	allowHtml = true,
	components,
}: MarkdownRendererProps) {
	const globalStyle = useMarkdownStyle();
	const style = styleProp ?? globalStyle;
	const config = styleConfigs[style];
	const articleRef = useRef<HTMLElement | null>(null);

	return (
		<SelectionContextMenu selectAllContainerRef={articleRef}>
			<div
				className={cn(
					"markdown-renderer h-full overflow-y-auto select-text",
					config.wrapperClass,
					className,
				)}
			>
				<article ref={articleRef} className={config.articleClass}>
					{renderMarkdown({
						content,
						allowHtml,
						components: withComponents(config.components, components),
					})}
				</article>
			</div>
		</SelectionContextMenu>
	);
}
