import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { CodeXml } from "lucide-react";
import { FileIcon } from "renderer/lib/fileIcons";
import { FENCE_LABEL_CLASSNAME } from "../../constants";
import { languageDisplay } from "../../utils/languageDisplay";

export function FenceLanguage({ language }: { language: string | null }) {
	const { t } = useLingui();
	const { label, iconFileName } = languageDisplay(language);
	return (
		<div className="flex min-w-0 items-center gap-1.5">
			{iconFileName ? (
				<FileIcon className="size-4 shrink-0" fileName={iconFileName} />
			) : (
				<CodeXml className="size-4 shrink-0 text-foreground/45" />
			)}
			<span className={cn(FENCE_LABEL_CLASSNAME, "font-medium")}>
				{label ?? t({ message: "Plain text" })}
			</span>
		</div>
	);
}
