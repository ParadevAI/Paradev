"use client";

import type { CloudUsageLink as LinkType } from "@superset/ui/cloud-usage-page";
import Link from "next/link";
import { cloudUsageHref } from "../../utils/cloudUsageHref";

export const CloudUsageLink: LinkType = ({ to, ...props }) => (
	<Link href={cloudUsageHref(to)} {...props} />
);
