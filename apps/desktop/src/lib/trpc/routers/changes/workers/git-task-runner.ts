import { cpus } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	type WorkerTaskOptions,
	WorkerTaskRunner,
} from "../../../workers/WorkerTaskRunner";
import { executeGitTask } from "./git-task-handlers";
import type {
	GitTaskPayloadMap,
	GitTaskResultMap,
	GitTaskType,
} from "./git-task-types";

const WORKER_COUNT = Math.max(1, Math.min(4, cpus().length - 1));
const WORKER_DEBUG = process.env.SUPERSET_WORKER_DEBUG === "1";
const FORCE_INLINE_GIT_TASKS =
	process.env.DESKTOP_WEB_MODE === "1" ||
	process.env.SUPERSET_INLINE_GIT_TASKS === "1";

let gitTaskRunner: WorkerTaskRunner | null = null;
let didRegisterDisposeHook = false;

function getWorkerScriptPath(): string {
	const resolveWorkerPath = (basePath: string): string => {
		const candidates = [
			join(basePath, "dist", "main", "git-task-worker.js"),
			join(basePath, "src", "main", "git-task-worker.ts"),
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) {
				return candidate;
			}
		}
		return candidates[0];
	};

	try {
		// Lazy require avoids test/runtime issues where electron is unavailable.
		const { app } = require("electron") as typeof import("electron");
		const appPath = app?.getAppPath?.() ?? process.cwd();
		return resolveWorkerPath(appPath);
	} catch {
		return resolveWorkerPath(process.cwd());
	}
}

function getRunner(): WorkerTaskRunner {
	if (!gitTaskRunner) {
		gitTaskRunner = new WorkerTaskRunner({
			workerScriptPath: getWorkerScriptPath(),
			concurrency: WORKER_COUNT,
			name: "changes-git",
			debug: WORKER_DEBUG,
		});

		if (!didRegisterDisposeHook) {
			try {
				const { app } = require("electron") as typeof import("electron");
				app?.once("before-quit", () => {
					void gitTaskRunner?.dispose();
					gitTaskRunner = null;
				});
				didRegisterDisposeHook = true;
			} catch (error) {
				console.warn(
					"[changes-git] failed to register before-quit dispose hook",
					error,
				);
			}
		}
	}
	return gitTaskRunner;
}

function shouldUseInlineGitTasks(): boolean {
	return FORCE_INLINE_GIT_TASKS;
}

function isWorkerResolutionError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		error.message.includes("Cannot find module") ||
		error.message.includes("git-task-worker")
	);
}

export function runGitTask<TTask extends GitTaskType>(
	taskType: TTask,
	payload: GitTaskPayloadMap[TTask],
	options?: WorkerTaskOptions,
): Promise<GitTaskResultMap[TTask]> {
	if (shouldUseInlineGitTasks()) {
		return executeGitTask(taskType, payload);
	}

	return getRunner()
		.runTask<GitTaskResultMap[TTask]>(taskType, payload, options)
		.catch((error) => {
			if (!isWorkerResolutionError(error)) {
				throw error;
			}

			console.warn(
				"[changes-git] Worker task runner unavailable, falling back to inline execution:",
				error instanceof Error ? error.message : String(error),
			);
			return executeGitTask(taskType, payload);
		});
}
