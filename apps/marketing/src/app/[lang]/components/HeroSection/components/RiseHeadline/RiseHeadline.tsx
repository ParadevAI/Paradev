import { EdgeGlare } from "@/app/[lang]/components/EdgeGlare";

interface RiseHeadlineProps {
	lead: string;
	emphasis: string;
}

export function RiseHeadline({ lead, emphasis }: RiseHeadlineProps) {
	return (
		<span className="headline-rise">
			<span className="headline-rise-clip">
				<span className="headline-rise-line">{lead}</span>
			</span>
			{"\n"}
			<span className="headline-marks">
				<span className="headline-rise-clip">
					<span className="headline-rise-line">{emphasis}</span>
				</span>
				<EdgeGlare
					edges="horizontal"
					radius={260}
					strength={0.9}
					thickness={1.5}
					className="-inset-x-[max(0.4em,20px)] top-[0.2em] bottom-[0.24em]"
				/>
			</span>
		</span>
	);
}
