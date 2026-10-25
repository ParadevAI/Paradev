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
			</span>
		</span>
	);
}
