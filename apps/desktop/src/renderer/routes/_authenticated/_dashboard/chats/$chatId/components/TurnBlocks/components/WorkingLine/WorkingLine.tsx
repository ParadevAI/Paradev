import { LuLoaderCircle } from "react-icons/lu";

/** A small spinner and what is happening, for example "Waking up…". */
export function WorkingLine({ label }: { label: string }) {
	return (
		<output className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground">
			<LuLoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
			<span>{label}</span>
		</output>
	);
}
