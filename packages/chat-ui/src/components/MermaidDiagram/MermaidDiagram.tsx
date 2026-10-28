import { cn } from "@superset/ui/utils";

/** A drawn diagram; a click hands it to the caller to show large. */
export function MermaidDiagram({
	className,
	label,
	onExpand,
	svg,
}: {
	svg: string;
	label: string;
	onExpand?: () => void;
	className?: string;
}) {
	return (
		<button
			aria-label={label}
			className={cn(
				"block w-full cursor-zoom-in px-3 py-3 text-left [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:max-w-full",
				className,
			)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid sanitises its own output under its strict security level
			dangerouslySetInnerHTML={{ __html: svg }}
			onClick={onExpand}
			type="button"
		/>
	);
}
