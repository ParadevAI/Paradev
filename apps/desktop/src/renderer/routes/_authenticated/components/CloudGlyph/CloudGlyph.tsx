import { cn } from "@superset/ui/utils";
import "./cloud-glyph.css";

const CLOUD_OUTLINE =
	"M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6A2.5 2.5 0 0 0 4.5 12.5Z";

export type CloudGlyphState = "on" | "connecting";

/** The cloud mark for cloud workspaces, drawn on a 16px grid to sit with Lucide icons. */
export function CloudGlyph({
	className,
	state = "on",
}: {
	className?: string;
	state?: CloudGlyphState;
}) {
	const isConnecting = state === "connecting";
	return (
		<svg
			viewBox="1.5 1.2 13.5 13.5"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.1}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			data-state={state}
			className={className}
		>
			<path
				d={CLOUD_OUTLINE}
				className={cn("cloud-glyph-outline", isConnecting && "opacity-35")}
			/>
			{isConnecting && (
				<path d={CLOUD_OUTLINE} pathLength={100} className="cloud-glyph-arc" />
			)}
		</svg>
	);
}
