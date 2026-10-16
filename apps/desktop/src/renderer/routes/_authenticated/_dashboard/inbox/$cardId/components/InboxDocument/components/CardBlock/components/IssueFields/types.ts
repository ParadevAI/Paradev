import type { LinearFieldsView } from "../../types";
import type { IssueFieldKey } from "../../utils/linearFields";
import type { FieldFace } from "../FieldPicker";
import type { PickerRow } from "../PickerList";

export type { FieldFace, PickerRow };

export interface FieldModel {
	key: IssueFieldKey;
	name: string;
	placeholder: string;
	/** The key that opens the picker, as Linear shows it. */
	shortcut: string;
	shift: boolean;
	multi: boolean;
	rows: PickerRow[];
	face: (fields: Partial<LinearFieldsView>) => FieldFace;
	/** The fields after the row with this id is picked. */
	pick: (
		fields: Partial<LinearFieldsView>,
		id: string,
	) => Partial<LinearFieldsView>;
}
