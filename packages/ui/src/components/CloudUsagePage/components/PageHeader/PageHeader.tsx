import { Fragment, type ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "../../../ui/breadcrumb";
import type { CloudUsageLink, CloudUsageTarget } from "../../types";

interface PageHeaderProps {
	Link: CloudUsageLink;
	/** The pages above this one; the title is the last crumb. */
	crumbs?: { label: ReactNode; to: CloudUsageTarget }[];
	title: ReactNode;
	/** The last crumb, when it is not the title. */
	current?: ReactNode;
	/** Beside the title, such as a status pill. */
	badge?: ReactNode;
	actions?: ReactNode;
	/** The period control, always the header's top right. */
	period?: ReactNode;
}

export function PageHeader({
	Link,
	crumbs,
	title,
	current = title,
	badge,
	actions,
	period,
}: PageHeaderProps) {
	return (
		<header className="space-y-2">
			{crumbs && (
				<Breadcrumb>
					<BreadcrumbList>
						{crumbs.map((crumb) => (
							<Fragment key={crumb.to.view}>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link to={crumb.to}>{crumb.label}</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
							</Fragment>
						))}
						<BreadcrumbItem className="min-w-0">
							<BreadcrumbPage
								title={typeof current === "string" ? current : undefined}
								className="truncate"
							>
								{current}
							</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			)}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<h2 className="min-w-0 text-xl font-semibold break-words">{title}</h2>
				{badge}
				{(actions || period) && (
					<div className="ml-auto flex items-center gap-2">
						{actions}
						{period}
					</div>
				)}
			</div>
		</header>
	);
}
