import { cn } from "@superset/ui/utils";
import "./mermaid-diagram.css";

/** A drawn diagram at its natural size, fit to the width; a click hands it to the caller to show large. */
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
				"block w-full cursor-zoom-in text-left [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-w-full",
				className,
			)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: the renderer escapes labels and the markup passed through sanitizeSvg
			dangerouslySetInnerHTML={{ __html: svg }}
			onClick={onExpand}
			type="button"
		/>
	);
}
