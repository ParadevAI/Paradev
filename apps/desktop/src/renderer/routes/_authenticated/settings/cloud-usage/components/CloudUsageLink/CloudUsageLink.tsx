import type { CloudUsageLink as LinkType } from "@superset/ui/cloud-usage-page";
import { Link } from "@tanstack/react-router";

export const CloudUsageLink: LinkType = ({ to, ...props }) => {
	switch (to.view) {
		case "overview":
			return (
				<Link
					to="/settings/cloud-usage"
					search={{ period: to.period }}
					{...props}
				/>
			);
		case "workspaces": {
			const { view: _, ...search } = to;
			return (
				<Link
					to="/settings/cloud-usage/workspaces"
					search={search}
					{...props}
				/>
			);
		}
		case "workspace":
			return (
				<Link
					to="/settings/cloud-usage/workspaces/$workspaceId"
					params={{ workspaceId: to.workspaceId }}
					search={{ period: to.period }}
					{...props}
				/>
			);
		case "billing":
			return <Link to="/settings/billing" {...props} />;
	}
};
