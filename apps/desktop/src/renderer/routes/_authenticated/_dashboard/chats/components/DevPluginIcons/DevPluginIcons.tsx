import { cn } from "@superset/ui/utils";
import { PluginIcon } from "renderer/components/PluginIcon";

/** The app a Dev uses to act in Paradev itself, as plugins name it. */
const PARADEV_PLUGIN = "superset";

interface DevPluginIconsProps {
	/** Plugin names; `paradev` is Paradev itself. */
	plugins: string[];
	className?: string;
}

/** The plugins a Dev or a listing uses, as a row of their icons. */
export function DevPluginIcons({ plugins, className }: DevPluginIconsProps) {
	if (plugins.length === 0) return null;
	return (
		<span className={cn("flex shrink-0 items-center gap-1", className)}>
			{plugins.map((plugin) => (
				<span key={plugin} title={plugin} className="flex">
					<PluginIcon
						pluginName={plugin === "paradev" ? PARADEV_PLUGIN : plugin}
						className="size-4"
					/>
				</span>
			))}
		</span>
	);
}
