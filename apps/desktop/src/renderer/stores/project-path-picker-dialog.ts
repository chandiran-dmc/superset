import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface ProjectPathPickerDialogState {
	isOpen: boolean;
	initialPath: string | null;
	onConfirm: ((paths: string[]) => void) | null;
	onCancel: (() => void) | null;
	open: (params: {
		initialPath?: string | null;
		onConfirm: (paths: string[]) => void;
		onCancel: () => void;
	}) => void;
	close: () => void;
}

export const useProjectPathPickerDialogStore =
	create<ProjectPathPickerDialogState>()(
		devtools(
			(set) => ({
				isOpen: false,
				initialPath: null,
				onConfirm: null,
				onCancel: null,

				open: ({ initialPath, onConfirm, onCancel }) => {
					set({
						isOpen: true,
						initialPath: initialPath ?? null,
						onConfirm,
						onCancel,
					});
				},

				close: () => {
					set({
						isOpen: false,
						initialPath: null,
						onConfirm: null,
						onCancel: null,
					});
				},
			}),
			{ name: "ProjectPathPickerDialogStore" },
		),
	);
