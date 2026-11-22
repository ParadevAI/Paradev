import { Fragment } from "react";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { cn } from "@/lib/utils";
import type { RowDetailPart } from "./utils/rowDetailParts";

/** A workspace row's muted second line, one text run so it wraps as a sentence. */
export function RowDetailLine({ parts }: { parts: RowDetailPart[] }) {
	const enlargedText = useEnlargedText();
	return (
		<Text
			className="text-muted-foreground mt-1 text-[13px]"
			numberOfLines={enlargedText ? undefined : 1}
		>
			{parts.map((part, index) => (
				<Fragment key={part.key}>
					{index > 0 ? " · " : null}
					<Text
						className={cn(
							"text-[13px]",
							part.ink ?? "text-muted-foreground",
							part.key === "diff" && "tabular-nums",
						)}
					>
						{part.text}
					</Text>
				</Fragment>
			))}
		</Text>
	);
}
