import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { PageToolPrompt } from "../../../../hooks/usePageTools";

export interface ConsentCopy {
	title: MessageDescriptor;
	body: MessageDescriptor;
	allow: MessageDescriptor;
	deny: MessageDescriptor;
}

export function consentCopy(
	prompt: PageToolPrompt,
	pageTitle: string,
): ConsentCopy {
	const pluginLabel = prompt.pluginLabel;
	switch (prompt.kind) {
		case "grant":
			return {
				title: msg({ message: `Allow this page to use ${pluginLabel}?` }),
				body: prompt.accountless
					? msg({
							message: `${pageTitle} can use ${pluginLabel} as you, including in future versions of this page. It can send what it reads to other websites. Only allow pages you trust.`,
						})
					: msg({
							message: `${pageTitle} can read and change data in your ${pluginLabel} account as you, including in future versions of this page. It can send what it reads to other websites. Only allow pages you trust.`,
						}),
				allow: msg({ message: "Allow" }),
				deny: msg({ message: "Don't allow" }),
			};
		case "install":
			return {
				title: msg({ message: `Install ${pluginLabel}?` }),
				body: msg({
					message: `${pageTitle} uses ${pluginLabel}. Install it to continue.`,
				}),
				allow: msg({ message: "Install" }),
				deny: msg({ message: "Cancel" }),
			};
		case "connect":
			return {
				title: msg({ message: `Connect ${pluginLabel}` }),
				body: msg({
					message: `Connect your ${pluginLabel} account, then reload this page.`,
				}),
				allow: msg({ message: "Connect" }),
				deny: msg({ message: "Cancel" }),
			};
		case "account":
			return {
				title: msg({ message: `Choose a ${pluginLabel} account` }),
				body: msg({ message: `${pageTitle} will use this account.` }),
				allow: msg({ message: "Use this account" }),
				deny: msg({ message: "Cancel" }),
			};
	}
}
