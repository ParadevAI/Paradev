import { cn } from "@superset/ui/utils";
import { useRef } from "react";
import type { RendererProps } from "../../ChatMarkdown";
import { TABLE_CLASSNAME, TABLE_SCROLLER_CLASSNAME } from "../../constants";
import { TableCopyActions } from "./components/TableCopyActions";

/** The table renderer for a reply: the table, then its copy actions. */
export function ChatTable({
	node: _node,
	className,
	children,
	...rest
}: RendererProps) {
	const tableRef = useRef<HTMLTableElement>(null);
	return (
		<div className="mb-2 max-w-full">
			<div className={TABLE_SCROLLER_CLASSNAME}>
				<table
					{...rest}
					className={cn(
						TABLE_CLASSNAME,
						typeof className === "string" && className,
					)}
					ref={tableRef}
				>
					{children}
				</table>
			</div>
			<TableCopyActions table={tableRef} />
		</div>
	);
}
