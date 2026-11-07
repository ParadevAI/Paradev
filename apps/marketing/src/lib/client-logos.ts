export interface ClientLogo {
	name: string;
	label: string;
	logo: string;
	height: number;
	marginTop?: number;
	borderRadius?: number;
	invert?: boolean;
}

export const CLIENT_LOGOS: ClientLogo[] = [
	{
		name: "wix",
		label: "Wix",
		logo: "/logos/wix-wordmark.svg",
		height: 18,
	},
	{
		name: "mistral",
		label: "Mistral AI",
		logo: "/logos/mistral-wordmark.png",
		height: 17,
	},
	{
		name: "toss",
		label: "Toss",
		logo: "/logos/toss-wordmark.svg",
		height: 18,
	},
	{
		name: "microsoft",
		label: "Microsoft",
		logo: "/logos/microsoft-wordmark.svg",
		height: 18,
	},
	{
		name: "monday",
		label: "monday.com",
		logo: "/logos/monday-wordmark.svg",
		height: 18,
	},
	{
		name: "datadog",
		label: "Datadog",
		logo: "/logos/datadog-wordmark.svg",
		height: 48,
	},
	{
		name: "salesforce",
		label: "Salesforce",
		logo: "/logos/salesforce-wordmark-dark.svg",
		height: 38,
		invert: false,
	},
	{
		name: "bytedance",
		label: "ByteDance",
		logo: "/logos/bytedance-wordmark.svg",
		height: 18,
	},
	{
		name: "grab",
		label: "Grab",
		logo: "/logos/grab-wordmark.svg",
		height: 22,
	},
	{
		name: "cfo-ai",
		label: "CFO.ai",
		logo: "/logos/cfo-ai-wordmark.svg",
		height: 26,
	},
	{
		name: "ramp",
		label: "Ramp",
		logo: "/logos/ramp-wordmark.svg",
		height: 20,
	},
	{
		name: "atlassian",
		label: "Atlassian",
		logo: "/logos/atlassian-white.png",
		height: 32,
		marginTop: 2,
	},
	{
		name: "adobe",
		label: "Adobe",
		logo: "/logos/adobe-wordmark.svg",
		height: 22,
	},
	{
		name: "nvidia",
		label: "NVIDIA",
		logo: "/logos/nvidia-wordmark.svg",
		height: 15,
	},
];
