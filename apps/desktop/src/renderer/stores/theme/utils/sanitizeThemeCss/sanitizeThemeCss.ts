import {
	type CssNode,
	generate,
	ident,
	type List,
	type ListItem,
	parse,
	walk,
} from "css-tree";
import { MAX_THEME_CSS_LENGTH } from "shared/themes";

const atRules = new Set([
	"media",
	"supports",
	"container",
	"layer",
	"scope",
	"starting-style",
	"keyframes",
	"-webkit-keyframes",
	"property",
	"font-face",
]);
const functions = new Set([
	"rgb",
	"rgba",
	"hsl",
	"hsla",
	"hwb",
	"lab",
	"lch",
	"oklab",
	"oklch",
	"color",
	"color-mix",
	"light-dark",
	"linear-gradient",
	"radial-gradient",
	"conic-gradient",
	"repeating-linear-gradient",
	"repeating-radial-gradient",
	"repeating-conic-gradient",
	"var",
	"env",
	"calc",
	"min",
	"max",
	"clamp",
	"round",
	"mod",
	"rem",
	"abs",
	"sign",
	"sin",
	"cos",
	"tan",
	"asin",
	"acos",
	"atan",
	"atan2",
	"pow",
	"sqrt",
	"hypot",
	"log",
	"exp",
	"blur",
	"brightness",
	"contrast",
	"drop-shadow",
	"grayscale",
	"hue-rotate",
	"invert",
	"opacity",
	"saturate",
	"sepia",
	"matrix",
	"matrix3d",
	"perspective",
	"rotate",
	"rotatex",
	"rotatey",
	"rotatez",
	"rotate3d",
	"scale",
	"scalex",
	"scaley",
	"scalez",
	"scale3d",
	"skew",
	"skewx",
	"skewy",
	"translate",
	"translatex",
	"translatey",
	"translatez",
	"translate3d",
	"cubic-bezier",
	"steps",
	"linear",
	"repeat",
	"minmax",
	"fit-content",
	"inset",
	"circle",
	"ellipse",
	"polygon",
	"path",
	"rect",
	"xywh",
	"counter",
	"counters",
	"symbols",
	"local",
	"format",
	"tech",
]);
const valueNodes = new Set([
	"Value",
	"Identifier",
	"Hash",
	"Number",
	"Percentage",
	"Dimension",
	"Operator",
	"String",
	"Parentheses",
]);
const customPropertyPrefix = "--paradev-theme-";

function themeProperty(name: string): string {
	const decoded = ident.decode(name);
	return ident.encode(
		decoded.startsWith(customPropertyPrefix)
			? decoded
			: `${customPropertyPrefix}${decoded.slice(2)}`,
	);
}

function supportedValue(value: CssNode): boolean {
	let supported = true;
	walk(value, (node) => {
		if (node.type === "Url") {
			if (
				!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(
					node.value,
				)
			)
				supported = false;
		} else if (node.type === "Function") {
			if (!functions.has(ident.decode(node.name).toLowerCase()))
				supported = false;
		} else if (!valueNodes.has(node.type)) supported = false;
	});
	return supported;
}

export function sanitizeThemeCss(css: string | undefined): string {
	if (!css || css.length > MAX_THEME_CSS_LENGTH) return "";
	try {
		const ast = parse(css, {
			parseCustomProperty: true,
			onParseError(error) {
				throw error;
			},
		});
		let nodes = 0;
		walk(ast, () => {
			if (++nodes > 16384) throw new Error("Theme CSS is too complex");
		});
		walk(ast, function (node, item, list) {
			if (node.type === "Atrule") {
				if (
					!atRules.has(ident.decode(node.name).toLowerCase()) ||
					(node.prelude && containsUnsafePrelude(node.prelude))
				) {
					list.remove(item);
					return this.skip;
				}
			}
			if (node.type === "Declaration") {
				const property = ident.decode(node.property);
				if (
					["behavior", "-moz-binding"].includes(property.toLowerCase()) ||
					!supportedValue(node.value)
				) {
					if (!item || !list) throw new Error("Unsupported CSS condition");
					list.remove(item);
					return this.skip;
				}
				if (property.startsWith("--"))
					node.property = themeProperty(node.property);
			}
			if (
				node.type === "Identifier" &&
				ident.decode(node.name).startsWith("--")
			)
				node.name = themeProperty(node.name);
			if (node.type === "Raw") throw new Error("Unsupported CSS syntax");
		});
		walk(ast, {
			leave(node: CssNode, item: ListItem<CssNode>, list: List<CssNode>) {
				if (
					node.type === "Rule" &&
					node.block?.children.isEmpty &&
					item &&
					list
				)
					list.remove(item);
			},
		});
		const output = generate(ast);
		return output.length <= MAX_THEME_CSS_LENGTH ? output : "";
	} catch {
		return "";
	}
}

function containsUnsafePrelude(prelude: CssNode): boolean {
	let unsafe = false;
	walk(prelude, (node) => {
		if (node.type === "Url" || node.type === "Raw") unsafe = true;
		if (
			node.type === "Function" &&
			!functions.has(ident.decode(node.name).toLowerCase()) &&
			ident.decode(node.name).toLowerCase() !== "selector"
		)
			unsafe = true;
	});
	return unsafe;
}
