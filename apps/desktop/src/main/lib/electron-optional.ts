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

type OpenDialogOption = {
	properties?: string[];
	title?: string;
	defaultPath?: string;
	filters?: Array<{
		name?: string;
		extensions?: string[];
	}>;
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

function runCommand(
	command: string,
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		try {
			const child = spawn(command, args, {
				stdio: ["ignore", "pipe", "pipe"],
			});
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});
			child.on("error", () => {
				resolve({ code: 1, stdout: "", stderr: "" });
			});
			child.on("close", (code) => {
				resolve({ code: code ?? 1, stdout, stderr });
			});
		} catch {
			resolve({ code: 1, stdout: "", stderr: "" });
		}
	});
}

async function commandExists(command: string): Promise<boolean> {
	const result = await runCommand("which", [command]);
	return result.code === 0;
}

function ensureDirectoryDefaultPath(pathValue?: string): string | undefined {
	if (!pathValue) return undefined;
	if (pathValue.endsWith("/")) return pathValue;
	return `${pathValue}/`;
}

function sanitizeAppleScriptString(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseCliPaths(stdout: string): string[] {
	return stdout
		.trim()
		.split(/\r?\n/)
		.map((value) => value.trim())
		.filter(Boolean);
}

async function showOpenDialogLinux(
	options: OpenDialogOption,
): Promise<OpenDialogResult> {
	const properties = new Set(options.properties ?? []);
	const openDirectory = properties.has("openDirectory");
	const multiSelections = properties.has("multiSelections");
	const title = options.title ?? "Select";
	const defaultPath = openDirectory
		? ensureDirectoryDefaultPath(options.defaultPath)
		: options.defaultPath;

	if (await commandExists("zenity")) {
		const args = ["--file-selection"];
		if (openDirectory) {
			args.push("--directory");
		}
		if (multiSelections) {
			args.push("--multiple", "--separator=\n");
		}
		args.push("--title", title);
		if (defaultPath) {
			args.push("--filename", defaultPath);
		}

		const filter = options.filters?.find(
			(item) => Array.isArray(item.extensions) && item.extensions.length > 0,
		);
		if (!openDirectory && filter?.extensions?.length) {
			const label = filter.name?.trim() || "Files";
			const patterns = filter.extensions
				.filter((extension) => extension.trim().length > 0)
				.map((extension) => `*.${extension.trim()}`)
				.join(" ");
			if (patterns.length > 0) {
				args.push(`--file-filter=${label} | ${patterns}`);
			}
		}

		const { code, stdout } = await runCommand("zenity", args);
		if (code !== 0) {
			return EMPTY_OPEN_DIALOG_RESULT;
		}
		const paths = parseCliPaths(stdout);
		if (paths.length === 0) {
			return EMPTY_OPEN_DIALOG_RESULT;
		}
		return { canceled: false, filePaths: paths };
	}

	if (await commandExists("kdialog")) {
		const args = openDirectory
			? ["--getexistingdirectory", defaultPath ?? "", "--title", title]
			: ["--getopenfilename", defaultPath ?? "", "--title", title];
		const { code, stdout } = await runCommand("kdialog", args);
		if (code !== 0) {
			return EMPTY_OPEN_DIALOG_RESULT;
		}
		const pathValue = stdout.trim();
		if (!pathValue) {
			return EMPTY_OPEN_DIALOG_RESULT;
		}
		return { canceled: false, filePaths: [pathValue] };
	}

	return EMPTY_OPEN_DIALOG_RESULT;
}

async function showOpenDialogMac(
	options: OpenDialogOption,
): Promise<OpenDialogResult> {
	if (!(await commandExists("osascript"))) {
		return EMPTY_OPEN_DIALOG_RESULT;
	}

	const properties = new Set(options.properties ?? []);
	const openDirectory = properties.has("openDirectory");
	const title = sanitizeAppleScriptString(options.title ?? "Select");
	let script = "";
	if (openDirectory) {
		script = `POSIX path of (choose folder with prompt "${title}")`;
	} else {
		script = `POSIX path of (choose file with prompt "${title}")`;
	}

	const { code, stdout } = await runCommand("osascript", ["-e", script]);
	if (code !== 0) {
		return EMPTY_OPEN_DIALOG_RESULT;
	}

	const filePath = stdout.trim();
	if (!filePath) {
		return EMPTY_OPEN_DIALOG_RESULT;
	}

	return { canceled: false, filePaths: [filePath] };
}

async function showOpenDialogCliFallback(
	options: OpenDialogOption,
): Promise<OpenDialogResult> {
	if (process.platform === "linux") {
		return showOpenDialogLinux(options);
	}
	if (process.platform === "darwin") {
		return showOpenDialogMac(options);
	}
	return EMPTY_OPEN_DIALOG_RESULT;
}

async function showSaveDialogLinux(
	options: Record<string, unknown>,
): Promise<SaveDialogResult> {
	if (!(await commandExists("zenity"))) {
		return EMPTY_SAVE_DIALOG_RESULT;
	}

	const title =
		typeof options.title === "string" && options.title.trim().length > 0
			? options.title
			: "Save File";
	const defaultPath =
		typeof options.defaultPath === "string" ? options.defaultPath : undefined;
	const args = [
		"--file-selection",
		"--save",
		"--confirm-overwrite",
		"--title",
		title,
	];
	if (defaultPath) {
		args.push("--filename", defaultPath);
	}

	const { code, stdout } = await runCommand("zenity", args);
	if (code !== 0) {
		return EMPTY_SAVE_DIALOG_RESULT;
	}

	const filePath = stdout.trim();
	if (!filePath) {
		return EMPTY_SAVE_DIALOG_RESULT;
	}

	return { canceled: false, filePath };
}

async function showSaveDialogMac(
	options: Record<string, unknown>,
): Promise<SaveDialogResult> {
	if (!(await commandExists("osascript"))) {
		return EMPTY_SAVE_DIALOG_RESULT;
	}

	const title =
		typeof options.title === "string" && options.title.trim().length > 0
			? options.title
			: "Save File";
	const sanitizedTitle = sanitizeAppleScriptString(title);
	const script = `POSIX path of (choose file name with prompt "${sanitizedTitle}")`;
	const { code, stdout } = await runCommand("osascript", ["-e", script]);
	if (code !== 0) {
		return EMPTY_SAVE_DIALOG_RESULT;
	}

	const filePath = stdout.trim();
	if (!filePath) {
		return EMPTY_SAVE_DIALOG_RESULT;
	}
	return { canceled: false, filePath };
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
		return showOpenDialogCliFallback(params.options as OpenDialogOption);
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
		return showOpenDialogCliFallback(params.options as OpenDialogOption);
	}
}

export async function showSaveDialogCompat(params: {
	window?: unknown;
	options: Record<string, unknown>;
}): Promise<SaveDialogResult> {
	const electron = await loadElectronModule();
	if (!electron?.dialog?.showSaveDialog) {
		if (process.platform === "linux") {
			return showSaveDialogLinux(params.options);
		}
		if (process.platform === "darwin") {
			return showSaveDialogMac(params.options);
		}
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
		if (process.platform === "linux") {
			return showSaveDialogLinux(params.options);
		}
		if (process.platform === "darwin") {
			return showSaveDialogMac(params.options);
		}
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
