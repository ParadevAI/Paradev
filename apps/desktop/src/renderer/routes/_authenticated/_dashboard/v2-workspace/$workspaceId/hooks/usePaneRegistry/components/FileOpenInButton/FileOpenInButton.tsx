import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuCheck, LuCopy } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { V2OpenInMenuButton } from "../../../../components/V2OpenInMenuButton";
import { useWorkspaceOpenInTarget } from "../../../useWorkspaceOpenInTarget";

interface FileOpenInButtonProps {
	workspaceId: string;
	filePath: string;
}

/** Open in menu for a local file; a Copy path button where apps can't open it. */
export function FileOpenInButton({
	workspaceId,
	filePath,
}: FileOpenInButtonProps) {
	const { t } = useLingui();
	const target = useWorkspaceOpenInTarget(workspaceId);
	const { copyToClipboard, copied } = useCopyToClipboard();
	if (target) {
		return (
			<V2OpenInMenuButton
				path={filePath}
				projectId={target.projectId}
				hotkeys={false}
			/>
		);
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Copy path" })}
					onClick={() => void copyToClipboard(filePath)}
					className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					{copied ? (
						<LuCheck className="size-3.5" />
					) : (
						<LuCopy className="size-3.5" />
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{copied ? <Trans>Copied</Trans> : <Trans>Copy path</Trans>}
			</TooltipContent>
		</Tooltip>
	);
}
