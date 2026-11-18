import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { CopyButton } from "../../../CopyButton";
import { CODE_CARD_CLASSNAME, FENCE_BUTTON_CLASSNAME } from "../../constants";
import type { Fence } from "../../utils/fencedCode";
import { FenceCode } from "../FenceCode";
import { FenceHeader } from "../FenceHeader";
import { WrapLinesButton } from "../WrapLinesButton";

/** A fence shown as code: a quiet label, then the code, with wrap and copy. */
export function PlainCodeBlock({
	fence,
	text,
}: {
	fence: Fence;
	text: string;
}) {
	const { t } = useLingui();
	const [wrap, setWrap] = useState(false);
	return (
		<div
			className={cn("mb-2 overflow-hidden", CODE_CARD_CLASSNAME)}
			data-chat-code-block={fence.language ?? ""}
		>
			<FenceHeader
				actions={
					<>
						<WrapLinesButton onChange={setWrap} wrap={wrap} />
						<CopyButton
							className={FENCE_BUTTON_CLASSNAME}
							iconClassName="size-3.5"
							label={t({ message: "Copy code" })}
							text={text}
						/>
					</>
				}
				fence={fence}
			/>
			<FenceCode fence={fence} text={text} wrap={wrap} />
		</div>
	);
}
