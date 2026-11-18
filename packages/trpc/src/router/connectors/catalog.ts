import {
	type ConnectorMethod,
	PUBLIC_CONNECTOR_SLUGS,
} from "@superset/shared/connectors";
import { requireConnector } from "../../lib/connectors";

export function methodSummary(method: ConnectorMethod) {
	return {
		type: method.type,
		label: method.label ?? method.type,
		inputs: method.type === "api_key" ? method.inputs : [],
	};
}

/** Every connector people may pick from. A hidden one is reached only through a plugin that names it. */
export function connectorCatalog() {
	return PUBLIC_CONNECTOR_SLUGS.map((slug) => {
		const connector = requireConnector(slug);
		return {
			slug,
			displayName: connector.displayName,
			icon: connector.icon,
			category: connector.category,
			scope: connector.scope,
			methods: connector.methods.map(methodSummary),
		};
	});
}
