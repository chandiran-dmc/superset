import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";

type OpenDialogResult = {
	canceled: boolean;
	filePaths: string[];
};

type SaveDialogResult = {
	canceled: boolean;
	filePath?: string;
};

type ElectronModuleLike = {
	shell?: {
		openExternal: (url: string) => Promise<void>;
		showItemInFolder: (filePath: string) => void;
		openPath: (filePath: string) => Promise<string>;
		trashItem: (filePath: string) => Promise<void>;
	};
	clipboard?: {
		writeText: (text: string) => void;
	};
	dialog?: {
		showOpenDialog: (...args: unknown[]) => Promise<OpenDialogResult>;
		showSaveDialog: (...args: unknown[]) => Promise<SaveDialogResult>;
	};
	systemPreferences?: {
		isTrustedAccessibilityClient: (prompt: boolean) => boolean;
		getMediaAccessStatus: (
			mediaType: "microphone" | "camera" | "screen",
		) => string;
		askForMediaAccess?: (
			mediaType: "microphone" | "camera",
		) => Promise<boolean>;
	};
	app?: {
		relaunch: () => void;
		exit: (code?: number) => void;
	};
};

const EMPTY_OPEN_DIALOG_RESULT: OpenDialogResult = {
	canceled: true,
	filePaths: [],
};

const EMPTY_SAVE_DIALOG_RESULT: SaveDialogResult = {
	canceled: true,
};

async function loadElectronModule(): Promise<ElectronModuleLike | null> {
	try {
		const mod = (await import("electron")) as unknown;
		if (!mod || typeof mod !== "object") {
			return null;
		}
		return mod as ElectronModuleLike;
	} catch {
		return null;
	}
}

function spawnDetached(command: string, args: string[]): void {
	try {
		const child = spawn(command, args, {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
	} catch {
		// Best-effort fallback.
	}
}

export async function openExternalUrl(url: string): Promise<void> {
	const electron = await loadElectronModule();
	if (electron?.shell?.openExternal) {
		await electron.shell.openExternal(url);
		return;
	}

	if (process.platform === "linux") {
		spawnDetached("xdg-open", [url]);
	}
}

export async function showItemInFolderCompat(filePath: string): Promise<void> {
	const electron = await loadElectronModule();
	if (electron?.shell?.showItemInFolder) {
		electron.shell.showItemInFolder(filePath);
		return;
	}

	if (process.platform === "linux") {
		spawnDetached("xdg-open", [dirname(filePath)]);
	}
}

export async function openPathCompat(filePath: string): Promise<void> {
	const electron = await loadElectronModule();
	if (electron?.shell?.openPath) {
		await electron.shell.openPath(filePath);
		return;
	}

	if (process.platform === "linux") {
		spawnDetached("xdg-open", [filePath]);
	}
}

export async function writeClipboardTextCompat(text: string): Promise<void> {
	const electron = await loadElectronModule();
	if (electron?.clipboard?.writeText) {
		electron.clipboard.writeText(text);
		return;
	}

	// No-op fallback in non-Electron runtime.
	void text;
}

export async function trashItemCompat(filePath: string): Promise<void> {
	const electron = await loadElectronModule();
	if (electron?.shell?.trashItem) {
		await electron.shell.trashItem(filePath);
		return;
	}

	await rm(filePath, { recursive: true, force: true });
}

export async function showOpenDialogCompat(params: {
	window?: unknown;
	options: Record<string, unknown>;
}): Promise<OpenDialogResult> {
	const electron = await loadElectronModule();
	if (!electron?.dialog?.showOpenDialog) {
		return EMPTY_OPEN_DIALOG_RESULT;
	}

	try {
		if (params.window) {
			return await electron.dialog.showOpenDialog(
				params.window,
				params.options,
			);
		}
		return await electron.dialog.showOpenDialog(params.options);
	} catch {
		return EMPTY_OPEN_DIALOG_RESULT;
	}
}

export async function showSaveDialogCompat(params: {
	window?: unknown;
	options: Record<string, unknown>;
}): Promise<SaveDialogResult> {
	const electron = await loadElectronModule();
	if (!electron?.dialog?.showSaveDialog) {
		return EMPTY_SAVE_DIALOG_RESULT;
	}

	try {
		if (params.window) {
			return await electron.dialog.showSaveDialog(
				params.window,
				params.options,
			);
		}
		return await electron.dialog.showSaveDialog(params.options);
	} catch {
		return EMPTY_SAVE_DIALOG_RESULT;
	}
}

export async function getSystemPreferencesCompat(): Promise<
	ElectronModuleLike["systemPreferences"] | null
> {
	const electron = await loadElectronModule();
	return electron?.systemPreferences ?? null;
}

export async function relaunchProcessCompat(): Promise<void> {
	const electron = await loadElectronModule();
	if (electron?.app?.relaunch && electron?.app?.exit) {
		electron.app.relaunch();
		electron.app.exit(0);
		return;
	}

	setTimeout(() => {
		process.exit(0);
	}, 25).unref();
}
