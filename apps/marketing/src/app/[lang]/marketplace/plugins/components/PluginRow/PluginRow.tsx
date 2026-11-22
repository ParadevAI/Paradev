import { PluginIcon } from "@/app/[lang]/components/PluginIcon";

interface PluginRowProps {
	name: string;
	displayName: string;
	description: string;
	version: string;
}

export function PluginRow({
	name,
	displayName,
	description,
	version,
}: PluginRowProps) {
	return (
		<li className="flex min-w-0 items-center gap-3 px-4 py-3">
			<PluginIcon name={name} />
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">{displayName}</p>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<span className="shrink-0 font-mono text-muted-foreground text-xs">
				v{version}
			</span>
		</li>
	);
}
