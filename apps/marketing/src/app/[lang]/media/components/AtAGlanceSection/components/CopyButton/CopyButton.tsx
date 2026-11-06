"use client";

import { Trans } from "@lingui/react/macro";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyButtonProps {
	/** ID of the element whose text is copied. */
	targetId: string;
}

export function CopyButton({ targetId }: CopyButtonProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		const text = document.getElementById(targetId)?.innerText.trim();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
		>
			{copied ? (
				<Check aria-hidden="true" className="size-4" />
			) : (
				<Copy aria-hidden="true" className="size-4" />
			)}
			{copied ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
		</button>
	);
}
