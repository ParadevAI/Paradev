import type { MermaidRenderer } from "../../types";
import { drawMermaid } from "../drawMermaid";
import { sanitizeSvg } from "../sanitizeSvg";

export const renderMermaid: MermaidRenderer = async (source) =>
	sanitizeSvg(await drawMermaid(source));
