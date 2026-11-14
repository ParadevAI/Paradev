import type { InstallInputModality } from "./installInputModality.types";

type Modality = "keyboard" | "pointer";

function setModality(modality: Modality) {
	document.documentElement.dataset.inputModality = modality;
}

export const installInputModality: InstallInputModality = () => {
	setModality("pointer");
	document.addEventListener("keydown", () => setModality("keyboard"), true);
	document.addEventListener("pointerdown", () => setModality("pointer"), true);
};
