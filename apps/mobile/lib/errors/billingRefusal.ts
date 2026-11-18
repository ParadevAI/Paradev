import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	type BillingRefusalKey,
	billingRefusalKey,
} from "./billingRefusalKeys";

const NOT_INCLUDED = msg({
	message: "Cloud workspaces are not included in your plan.",
});

const COPY: Record<BillingRefusalKey, MessageDescriptor> = {
	"serverError.cloudWorkspace.cloudNeedsPaidPlan": NOT_INCLUDED,
	"serverError.cloudWorkspace.cloudSandboxesAreInternalOnly": NOT_INCLUDED,
	"serverError.cloudWorkspace.usageLimitReached": msg({
		message: "Your organization reached its cloud usage limit.",
	}),
	"serverError.environment.notIncluded": msg({
		message: "Cloud environments are not included in your plan.",
	}),
	"serverError.environment.limitReached": msg({
		message: "Your organization reached its environment limit.",
	}),
};

export function billingRefusalCopy(error: unknown): string | null {
	const key = billingRefusalKey(error);
	return key ? i18n._(COPY[key]) : null;
}
