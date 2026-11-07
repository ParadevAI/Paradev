import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

const COPIED_MS = 1500;

export function CopyErrorButton({ text }: { text: string }) {
	const { copied, copyToClipboard } = useCopyToClipboard(COPIED_MS);
	return (
		<Button
			onClick={() => {
				copyToClipboard(text).catch((error: unknown) => {
					console.error("[chat] could not copy the error", error);
				});
			}}
			size="xs"
			variant="ghost"
		>
			{copied ? <Check /> : <Copy />}
			{copied ? <Trans>Copied</Trans> : <Trans>Copy error</Trans>}
		</Button>
	);
}
