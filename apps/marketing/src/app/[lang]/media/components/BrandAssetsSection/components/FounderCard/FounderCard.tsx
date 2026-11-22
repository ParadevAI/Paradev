import { Trans } from "@lingui/react/macro";
import { Download } from "lucide-react";
import Image from "next/image";

interface FounderCardProps {
	id: string;
	name: string;
	role: string;
	avatar: string;
}

export function FounderCard({ id, name, role, avatar }: FounderCardProps) {
	const extension = avatar.split(".").pop();

	return (
		<li className="flex flex-col border border-border">
			<div className="relative aspect-square overflow-hidden bg-muted">
				<Image
					src={avatar}
					alt={name}
					fill
					sizes="(min-width: 640px) 33vw, 100vw"
					className="object-cover"
				/>
			</div>
			<div className="flex items-end justify-between gap-3 border-border border-t px-4 py-3">
				<div className="min-w-0 flex-1">
					<p className="text-foreground text-sm">{name}</p>
					<p className="font-mono text-muted-foreground text-xs">{role}</p>
				</div>
				<a
					href={avatar}
					download={`paradev-${id}.${extension}`}
					className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
				>
					<Download aria-hidden="true" className="size-4" />
					<Trans>Download</Trans>
				</a>
			</div>
		</li>
	);
}
