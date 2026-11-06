import { type ReactNode, useState } from "react";
import { PreviewHoverCard } from "../PreviewHoverCard";
import { useWebsitePreview } from "./hooks/useWebsitePreview";

export function PageHoverCard({
	children,
	url,
	workspaceId,
}: {
	children: ReactNode;
	url: string;
	workspaceId: string;
}) {
	const [open, setOpen] = useState(false);
	const [wanted, setWanted] = useState(false);
	const load = useWebsitePreview(url, {
		active: wanted || open,
		workspaceId,
	});
	return (
		<PreviewHoverCard
			load={load}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setWanted(false);
			}}
			onWanted={() => setWanted(true)}
			open={open}
			url={url}
		>
			{children}
		</PreviewHoverCard>
	);
}
