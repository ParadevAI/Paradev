import type { ReactNode } from "react";
import type { Fence } from "../../utils/fencedCode";
import { FenceFilePath } from "../FenceFilePath";
import { FenceLanguage } from "../FenceLanguage";

/** A fence's header row: what the fence is on the left, its actions on the right. */
export function FenceHeader({
	actions,
	fence,
}: {
	fence: Fence;
	actions: ReactNode;
}) {
	return (
		<div className="flex h-9 items-center justify-between gap-2 pr-1.5 pl-3">
			{fence.file ? (
				<FenceFilePath file={fence.file} />
			) : (
				<FenceLanguage language={fence.language} />
			)}
			<div className="flex shrink-0 items-center gap-1">{actions}</div>
		</div>
	);
}
