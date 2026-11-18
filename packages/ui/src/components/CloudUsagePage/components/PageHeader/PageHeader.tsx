import { Fragment, type ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
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
}

export function PageHeader({
	Link,
	crumbs,
	title,
	current = title,
	badge,
	actions,
}: PageHeaderProps) {
	return (
		<header className="space-y-2">
			{crumbs && (
				<Breadcrumb>
					<BreadcrumbList>
						{crumbs.map((crumb) => (
							<Fragment key={crumb.to.view}>
								<BreadcrumbItem>
									<Link
										to={crumb.to}
										className="transition-colors hover:text-foreground"
									>
										{crumb.label}
									</Link>
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
				<h2 className="min-w-0 text-2xl font-semibold break-words">{title}</h2>
				{badge}
				{actions && (
					<div className="ml-auto flex items-center gap-2">{actions}</div>
				)}
			</div>
		</header>
	);
}
