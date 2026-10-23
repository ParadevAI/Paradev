import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { PlanFamily } from "@superset/shared/billing";
import { COMPANY } from "@superset/shared/constants";

export interface PricingFeature {
	id: string;
	label: MessageDescriptor;
	needs?: "gbHours";
	beta?: boolean;
	detail?: MessageDescriptor;
	info?: { body: MessageDescriptor; faqId: string };
}

export const BETA = msg({ message: "Beta" });

export interface PricingTier {
	id: string;
	name: MessageDescriptor | string;
	description: MessageDescriptor;
	price:
		| { kind: "fixed"; display: string; note: MessageDescriptor }
		| {
				kind: "seat";
				family: PlanFamily;
				note: MessageDescriptor;
				monthlyCadence: MessageDescriptor;
				yearlyCadence: MessageDescriptor;
		  }
		| { kind: "custom"; display: MessageDescriptor; note: MessageDescriptor };
	features: PricingFeature[];
	cta: {
		label: MessageDescriptor;
		href: string;
		event: "download_clicked" | "contact_sales_clicked" | "checkout_clicked";
		variant: "default" | "outline" | "secondary";
		external?: boolean;
	};
	ctaNote?: { label: MessageDescriptor; href?: string };
	highlight?: boolean;
}

export const FREE_TIER: PricingTier = {
	id: "free",
	name: msg({ message: "Free" }),
	description: msg({
		message: "For individuals getting started",
	}),
	price: {
		kind: "fixed",
		display: "$0",
		note: msg({
			message: "Free for everyone",
		}),
	},
	features: [
		{
			id: "users",
			label: msg({
				message: "1 user",
			}),
		},
		{
			id: "localWorkspaces",
			label: msg({
				message: "Local workspaces",
			}),
		},
		{
			id: "desktopApp",
			label: msg({
				message: "Desktop app",
			}),
		},
		{
			id: "cli",
			label: msg({
				message: "CLI",
			}),
		},
	],
	cta: {
		label: msg({
			message: "Download app",
		}),
		href: "/download",
		event: "download_clicked",
		variant: "outline",
	},
	ctaNote: {
		label: msg({
			message: "No credit card required.",
		}),
	},
};

export const ENTERPRISE_TIER: PricingTier = {
	id: "enterprise",
	name: msg({
		message: "Enterprise",
	}),
	description: msg({
		message: "For organizations with advanced needs",
	}),
	price: {
		kind: "custom",
		display: msg({
			message: "Custom pricing",
		}),
		note: msg({
			message: "Annual billing only",
		}),
	},
	features: [
		{
			id: "everythingInUltra",
			label: msg({
				message: "Everything in Ultra",
			}),
		},
		{
			id: "ssoScim",
			label: msg({
				message: "SAML SSO & SCIM provisioning",
			}),
		},
		{
			id: "auditLogs",
			label: msg({
				message: "Audit logs",
			}),
		},
		{
			id: "soc2",
			label: msg({
				message: "SOC 2 Type II report",
			}),
		},
		{
			id: "slaSupport",
			label: msg({
				message: "Uptime SLA & dedicated support",
			}),
		},
		{
			id: "customIntegrations",
			label: msg({
				message: "Custom integrations",
			}),
		},
	],
	cta: {
		label: msg({
			message: "Contact sales",
		}),
		href: "/enterprise",
		event: "contact_sales_clicked",
		variant: "outline",
	},
	ctaNote: {
		label: msg({
			message: "Review our security",
		}),
		href: COMPANY.TRUST_URL,
	},
};

const FAMILY_DESCRIPTIONS: Record<string, MessageDescriptor> = {
	pro: msg({ message: "For teams that need more power" }),
	team: msg({ message: "For teams that run agents every day" }),
	ultra: msg({ message: "For people who keep agents running all day" }),
};

const GENERIC_DESCRIPTION = msg({
	message: "For teams that run more agents in the cloud",
});

const CLOUD_WORKSPACES = msg({ message: "Cloud workspaces" });

const CLOUD_WORKSPACES_FEATURE: PricingFeature = {
	id: "cloudWorkspaces",
	label: CLOUD_WORKSPACES,
	needs: "gbHours",
	beta: true,
	detail: msg({ message: "{hours} hours per seat each month" }),
	info: {
		body: msg({
			message:
				"Hours are shared across your team. They assume a standard {vcpus} vCPU / {memoryGb} GB workspace, and bigger machines use them faster.",
		}),
		faqId: "cloudHours",
	},
};

const BASE_FEATURES: PricingFeature[] = [
	{
		id: "everythingInFree",
		label: msg({
			message: "Everything in Free",
		}),
	},
	CLOUD_WORKSPACES_FEATURE,
	{
		id: "remoteAccess",
		label: msg({
			message: "Remote access",
		}),
	},
	{
		id: "automations",
		label: msg({
			message: "Automations",
		}),
	},
	{
		id: "linearIntegration",
		label: msg({
			message: "Linear integration",
		}),
	},
	{
		id: "slackIntegration",
		label: msg({
			message: "Slack integration",
		}),
	},
	{
		id: "mobile",
		label: msg({
			message: "Mobile",
		}),
	},
];

const STEP_UP_FEATURES: PricingFeature[] = [
	{
		id: "everythingInPrevious",
		label: msg({ message: "Everything in {previousPlan}" }),
	},
	CLOUD_WORKSPACES_FEATURE,
];

const SEAT_PRICE = {
	note: msg({ message: "per user/month" }),
	monthlyCadence: msg({ message: "Billed monthly" }),
	yearlyCadence: msg({ message: "{yearlyTotal} per user, billed yearly" }),
};

export function pricingTiers(catalog: PlanFamily[]): PricingTier[] {
	return [
		FREE_TIER,
		...catalog.map(
			(family, index): PricingTier => ({
				id: family.family,
				name: family.name,
				description: FAMILY_DESCRIPTIONS[family.family] ?? GENERIC_DESCRIPTION,
				price: { kind: "seat", family, ...SEAT_PRICE },
				features: index === 0 ? BASE_FEATURES : STEP_UP_FEATURES,
				cta: {
					label: msg({ message: "Get {plan}" }),
					href: "/settings/billing",
					event: "checkout_clicked",
					variant: index === 0 ? "default" : "outline",
				},
				highlight: index === 0,
			}),
		),
		ENTERPRISE_TIER,
	];
}

// Plain strings stay raw numerals ("1"); anything with words is a descriptor.
export type ComparisonValue = string | boolean | MessageDescriptor;

export interface ComparisonRow {
	id: string;
	label: MessageDescriptor;
	values: [
		free: ComparisonValue | null,
		paid: ComparisonValue | null,
		enterprise: ComparisonValue | null,
	];
	cloud?: "gbHours" | "environments" | "overageRate" | "pack";
}

export interface ComparisonSection {
	id: string;
	title: MessageDescriptor;
	badge?: MessageDescriptor;
	rows: ComparisonRow[];
}

const UNLIMITED = msg({
	message: "Unlimited",
});

const CUSTOM = msg({ message: "Custom" });

export const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		id: "usage",
		title: msg({
			message: "Usage",
		}),
		rows: [
			{
				id: "teamMembers",
				label: msg({
					message: "Team members",
				}),
				values: ["1", UNLIMITED, UNLIMITED],
			},
			{
				id: "workspaces",
				label: msg({
					message: "Workspaces",
				}),
				values: [UNLIMITED, UNLIMITED, UNLIMITED],
			},
			{
				id: "projects",
				label: msg({
					message: "Projects",
				}),
				values: [UNLIMITED, UNLIMITED, UNLIMITED],
			},
		],
	},
	{
		id: "cloud",
		title: CLOUD_WORKSPACES,
		badge: BETA,
		rows: [
			{
				id: "cloudGbHours",
				label: msg({
					message: "Cloud GB-hours per seat each month",
				}),
				values: [null, null, CUSTOM],
				cloud: "gbHours",
			},
			{
				id: "cloudEnvironments",
				label: msg({ message: "Cloud environments" }),
				values: [null, null, CUSTOM],
				cloud: "environments",
			},
			{
				id: "overage",
				label: msg({ message: "GB-hours past the pool" }),
				values: [null, null, CUSTOM],
				cloud: "overageRate",
			},
			{
				id: "gbHourPacks",
				label: msg({
					message: "Extra GB-hours, bought as needed",
				}),
				values: [null, null, CUSTOM],
				cloud: "pack",
			},
		],
	},
	{
		id: "features",
		title: msg({
			message: "Features",
		}),
		rows: [
			{
				id: "desktopApp",
				label: msg({
					message: "Desktop app",
				}),
				values: [true, true, true],
			},
			{
				id: "localWorkspaces",
				label: msg({
					message: "Local workspaces",
				}),
				values: [true, true, true],
			},
			{
				id: "remoteAccess",
				label: msg({
					message: "Remote access",
				}),
				values: [null, true, true],
			},
			{
				id: "automations",
				label: msg({
					message: "Automations",
				}),
				values: [null, true, true],
			},
			{
				id: "mobileApp",
				label: msg({
					message: "Mobile app",
				}),
				values: [null, true, true],
			},
			{
				id: "linearIntegration",
				label: msg({
					message: "Linear integration",
				}),
				values: [null, true, true],
			},
			{
				id: "slackIntegration",
				label: msg({
					message: "Slack integration",
				}),
				values: [null, true, true],
			},
			{
				id: "teamCollaboration",
				label: msg({
					message: "Team collaboration",
				}),
				values: [null, true, true],
			},
		],
	},
	{
		id: "support",
		title: msg({
			message: "Support",
		}),
		rows: [
			{
				id: "prioritySupport",
				label: msg({
					message: "Priority support",
				}),
				values: [null, null, true],
			},
			{
				id: "uptimeSla",
				label: msg({
					message: "Uptime SLA",
				}),
				values: [null, null, true],
			},
			{
				id: "customContracts",
				label: msg({
					message: "Custom contracts",
				}),
				values: [null, null, true],
			},
		],
	},
	{
		id: "security",
		title: msg({
			message: "Security",
		}),
		rows: [
			{
				id: "sso",
				label: msg({
					message: "SSO/SAML",
				}),
				values: [null, null, true],
			},
			{
				id: "ipRestrictions",
				label: msg({
					message: "IP restrictions",
				}),
				values: [null, null, true],
			},
			{
				id: "scim",
				label: msg({
					message: "SCIM provisioning",
				}),
				values: [null, null, true],
			},
			{
				id: "auditLog",
				label: msg({
					message: "Audit log",
				}),
				values: [null, null, true],
			},
			{
				id: "soc2",
				label: msg({
					message: "SOC 2 Type II report",
				}),
				values: [null, null, true],
			},
		],
	},
];

export interface PricingFAQItem {
	id: string;
	question: MessageDescriptor;
	answer: MessageDescriptor;
	list?: "allowances";
	more?: MessageDescriptor[];
	needs?: "prices" | "gbHours" | "pack";
}

export const PRICING_FAQ_ITEMS: PricingFAQItem[] = [
	{
		id: "freePlan",
		question: msg({
			message: "Is there a free plan?",
		}),
		answer: msg({
			message:
				"Yes. Free covers individuals with 1 user, local workspaces, the desktop app, and the CLI. No credit card required.",
		}),
	},
	{
		id: "proPricing",
		question: msg({
			message: "How do the paid plans work?",
		}),
		answer: msg({
			message:
				"Paid plans are priced per user per month and billed for each active seat on your team. {planPrices}.",
		}),
		needs: "prices",
	},
	{
		id: "cloudHours",
		question: msg({
			message: "How do cloud hours work?",
		}),
		answer: msg({
			message: "Each seat adds its plan's hours to one pool your team shares:",
		}),
		list: "allowances",
		more: [
			msg({
				message:
					"Hours assume a standard {vcpus} vCPU / {memoryGb} GB workspace. We meter GB-hours, the memory of the machine times the hours it runs, so a machine with twice the memory uses hours twice as fast.",
			}),
			msg({
				message:
					"The pool resets every month. Usage past it is billed per GB-hour at the rate shown on each plan.",
			}),
		],
		needs: "gbHours",
	},
	{
		id: "buyGbHours",
		question: msg({
			message: "Can I buy more cloud GB-hours?",
		}),
		answer: msg({
			message:
				"Yes. On plans with cloud workspaces, owners can buy any amount of extra GB-hours at {packPrice} per GB-hour in Settings, Billing. Bought GB-hours are used after the monthly pool and never expire, and auto top-up can buy more when they run low.",
		}),
		needs: "pack",
	},
	{
		id: "switchPlans",
		question: msg({
			message: "Can I switch plans or cancel anytime?",
		}),
		answer: msg({
			message:
				"Yes. You can upgrade, downgrade, or cancel at any time from the billing settings inside the app. Upgrades start right away, and you pay only the difference for the rest of the period. Downgrades and cancellations take effect at the end of your current billing period.",
		}),
	},
	{
		id: "enterpriseIncludes",
		question: msg({
			message: "What's included in Enterprise?",
		}),
		answer: msg({
			message:
				"Everything in Ultra plus custom cloud GB-hours, SSO & SAML, SCIM provisioning, IP restrictions, audit logs, a custom SLA, dedicated support, and custom contracts. Pricing is tailored to your organization. Get in touch and we'll scope something that fits.",
		}),
	},
	{
		id: "soc2",
		question: msg({
			message: "Is Superset SOC 2 compliant?",
		}),
		answer: msg({
			message:
				"Yes. Superset has completed a SOC 2 Type II audit with an independent auditor, covering our security controls in operation over time. Request the report and review our security documentation at trust.superset.sh.",
		}),
	},
	{
		id: "whereCodeRuns",
		question: msg({
			message: "Where does my code run?",
		}),
		answer: msg({
			message:
				"On your machine. Repos, worktrees, terminal output, and agent sessions stay local by default; cloud sync covers account and organization metadata only. Superset doesn't proxy any API calls.",
		}),
	},
	{
		id: "agentSubscriptions",
		question: msg({
			message: "Do I need my own coding agent subscriptions?",
		}),
		answer: msg({
			message:
				"Yes. Superset is the workspace your agents run in, not a model provider. Bring Claude Code, Codex, OpenCode, or any CLI agent, and use your existing accounts or API keys on every plan.",
		}),
	},
];
