import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { Component, type ReactNode } from "react";
export class PanelBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? (
			<div className="usage-panel p-4" role="alert">
				<p>
					{i18n._(
						msg({ message: "Could not load accounts. Refresh to try again." }),
					)}
				</p>
				<button type="button" onClick={() => location.reload()}>
					{i18n._(msg({ message: "Retry" }))}
				</button>
			</div>
		) : (
			this.props.children
		);
	}
}
