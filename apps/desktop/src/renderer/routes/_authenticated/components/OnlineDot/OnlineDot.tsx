import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";

export function OnlineDot({ online }: { online: boolean }) {
	const { t } = useLingui();
	return (
		<span
			role="img"
			aria-label={
				online
					? t({
							message: "online",
						})
					: t({
							message: "offline",
						})
			}
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				online ? "bg-emerald-500" : "bg-muted-foreground/60",
			)}
		/>
	);
}
