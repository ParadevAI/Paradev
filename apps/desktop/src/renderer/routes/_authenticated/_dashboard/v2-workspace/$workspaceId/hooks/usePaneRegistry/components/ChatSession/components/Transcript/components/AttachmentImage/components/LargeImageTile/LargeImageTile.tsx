import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { ImageIcon } from "lucide-react";

export function LargeImageTile({
	filename,
	loading = false,
	onClick,
}: {
	filename: string;
	loading?: boolean;
	onClick: () => void;
}) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			aria-busy={loading}
			aria-label={t({ message: `Preview ${filename}` })}
			className={cn(
				"flex size-40 cursor-zoom-in flex-col items-center justify-center gap-2 rounded-2xl bg-foreground/10 px-3 text-muted-foreground transition-colors hover:bg-foreground/15",
				loading && "animate-pulse",
			)}
			onClick={onClick}
		>
			<ImageIcon className="size-6" />
			<span className="line-clamp-2 max-w-full break-all text-center text-xs">
				{filename}
			</span>
		</button>
	);
}
