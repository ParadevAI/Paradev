import { useLingui } from "@lingui/react/macro";
import { ImageIcon } from "lucide-react";
import type { Ref } from "react";

export function LargeImageTile({
	filename,
	onClick,
	ref,
}: {
	filename: string;
	onClick: () => void;
	ref?: Ref<HTMLButtonElement>;
}) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			aria-label={t({ message: `Preview ${filename}` })}
			className="flex size-40 cursor-zoom-in flex-col items-center justify-center gap-2 rounded-2xl bg-foreground/10 px-3 text-muted-foreground transition-colors hover:bg-foreground/15"
			onClick={onClick}
			ref={ref}
		>
			<ImageIcon className="size-6" />
			<span className="line-clamp-2 max-w-full break-all text-center text-xs">
				{filename}
			</span>
		</button>
	);
}
