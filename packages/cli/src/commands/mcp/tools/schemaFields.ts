interface PropertySchema {
	type?: string | string[];
	enum?: unknown[];
	items?: PropertySchema;
	anyOf?: PropertySchema[];
	oneOf?: PropertySchema[];
	default?: unknown;
	description?: string;
}

export interface SchemaField {
	name: string;
	type: string;
	required: string;
	default: string;
	description: string;
}

function typeLabel(property: PropertySchema): string {
	if (property.enum) return property.enum.map(String).join(" | ");
	const union = property.anyOf ?? property.oneOf;
	if (union) return union.map(typeLabel).join(" | ");
	if (Array.isArray(property.type)) return property.type.join(" | ");
	if (property.type === "array" && property.items) {
		return `${typeLabel(property.items)}[]`;
	}
	return property.type ?? "any";
}

export function schemaFields(schema: {
	properties?: Record<string, object>;
	required?: string[];
}): SchemaField[] {
	return Object.entries(schema.properties ?? {}).map(([name, value]) => {
		const property = value as PropertySchema;
		return {
			name,
			type: typeLabel(property),
			required: schema.required?.includes(name) ? "yes" : "",
			default:
				property.default === undefined ? "" : JSON.stringify(property.default),
			description: property.description ?? "",
		};
	});
}
