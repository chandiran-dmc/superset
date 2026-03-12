import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

type HostServiceStatus = "starting" | "running" | "crashed";

interface HostServiceProcess {
	process: ChildProcess;
	port: number | null;
	status: HostServiceStatus;
	restartCount: number;
	lastCrash?: number;
	organizationId: string;
}

const MAX_RESTART_DELAY = 30_000;
const BASE_RESTART_DELAY = 1_000;

class HostServiceManager {
	private instances = new Map<string, HostServiceProcess>();
	private authToken: string | null = null;
	private cloudApiUrl: string | null = null;

	setAuthToken(token: string | null): void {
		this.authToken = token;
	}

	setCloudApiUrl(url: string | null): void {
		this.cloudApiUrl = url;
	}

	async start(organizationId: string): Promise<number> {
		const existing = this.instances.get(organizationId);
		if (existing?.status === "running" && existing.port !== null) {
			return existing.port;
		}
		if (existing?.status === "starting") {
			return this.waitForPort(organizationId);
		}

		return this.spawn(organizationId);
	}

	stop(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		if (!instance) return;

		instance.status = "crashed"; // prevent restart
		instance.process.kill("SIGTERM");
		this.instances.delete(organizationId);
	}

	stopAll(): void {
		for (const [id] of this.instances) {
			this.stop(id);
		}
	}

	getPort(organizationId: string): number | null {
		return this.instances.get(organizationId)?.port ?? null;
	}

	getStatus(organizationId: string): HostServiceStatus | null {
		return this.instances.get(organizationId)?.status ?? null;
	}

	private async spawn(organizationId: string): Promise<number> {
		const scriptPath = await this.getHostServiceScriptPath();
		if (!existsSync(scriptPath)) {
			throw new Error(`Host service script not found: ${scriptPath}`);
		}

		const env: Record<string, string | undefined> = {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			ORGANIZATION_ID: organizationId,
		};
		if (this.authToken) {
			env.AUTH_TOKEN = this.authToken;
		}
		if (this.cloudApiUrl) {
			env.CLOUD_API_URL = this.cloudApiUrl;
		}

		const isBunRuntime = process.execPath.toLowerCase().includes("bun");
		const isTsScript = scriptPath.endsWith(".ts");
		const spawnArgs = isTsScript
			? isBunRuntime
				? [scriptPath]
				: ["--import", "tsx", scriptPath]
			: [scriptPath];

		const child = spawn(process.execPath, spawnArgs, {
			stdio: ["ignore", "pipe", "pipe"],
			env,
		});

		const instance: HostServiceProcess = {
			process: child,
			port: null,
			status: "starting",
			restartCount: 0,
			organizationId,
		};

		this.instances.set(organizationId, instance);

		child.stderr?.on("data", (data: Buffer) => {
			console.error(
				`[host-service:${organizationId}] ${data.toString().trim()}`,
			);
		});

		child.on("exit", (code) => {
			console.log(`[host-service:${organizationId}] exited with code ${code}`);
			const current = this.instances.get(organizationId);
			if (
				current &&
				current.process === child &&
				current.status !== "crashed"
			) {
				current.status = "crashed";
				current.lastCrash = Date.now();
				this.scheduleRestart(organizationId);
			}
		});

		return this.waitForPort(organizationId);
	}

	private async getHostServiceScriptPath(): Promise<string> {
		try {
			const electron = (await import("electron")) as unknown;
			if (electron && typeof electron === "object") {
				const app = (
					electron as {
						app?: { getAppPath: () => string };
					}
				).app;
				if (app?.getAppPath) {
					const appPath = app.getAppPath();
					const builtPath = path.join(
						appPath,
						"dist",
						"main",
						"host-service.js",
					);
					if (existsSync(builtPath)) {
						return builtPath;
					}

					const sourcePath = path.join(
						appPath,
						"src",
						"main",
						"host-service",
						"index.ts",
					);
					if (existsSync(sourcePath)) {
						return sourcePath;
					}
				}
			}
		} catch {
			// Non-Electron runtime.
		}

		const builtPath = path.join(
			process.cwd(),
			"dist",
			"main",
			"host-service.js",
		);
		if (existsSync(builtPath)) {
			return builtPath;
		}

		return path.join(process.cwd(), "src", "main", "host-service", "index.ts");
	}

	private waitForPort(organizationId: string): Promise<number> {
		return new Promise((resolve, reject) => {
			const instance = this.instances.get(organizationId);
			if (!instance) {
				reject(new Error("Instance not found"));
				return;
			}

			if (instance.port !== null) {
				resolve(instance.port);
				return;
			}

			let buffer = "";
			const onData = (data: Buffer) => {
				buffer += data.toString();
				const newlineIdx = buffer.indexOf("\n");
				if (newlineIdx === -1) return;

				const line = buffer.slice(0, newlineIdx);
				instance.process.stdout?.off("data", onData);

				try {
					const parsed = JSON.parse(line) as { port: number };
					instance.port = parsed.port;
					instance.status = "running";
					console.log(
						`[host-service:${organizationId}] listening on port ${parsed.port}`,
					);
					resolve(parsed.port);
				} catch {
					reject(new Error(`Failed to parse port from host-service: ${line}`));
				}
			};

			instance.process.stdout?.on("data", onData);

			// Timeout after 10s
			setTimeout(() => {
				instance.process.stdout?.off("data", onData);
				reject(new Error("Timeout waiting for host-service port"));
			}, 10_000);
		});
	}

	private scheduleRestart(organizationId: string): void {
		const instance = this.instances.get(organizationId);
		if (!instance) return;

		const delay = Math.min(
			BASE_RESTART_DELAY * 2 ** instance.restartCount,
			MAX_RESTART_DELAY,
		);
		instance.restartCount++;

		console.log(
			`[host-service:${organizationId}] restarting in ${delay}ms (attempt ${instance.restartCount})`,
		);

		setTimeout(() => {
			const current = this.instances.get(organizationId);
			if (current?.status === "crashed") {
				this.instances.delete(organizationId);
				this.spawn(organizationId).catch((err) => {
					console.error(
						`[host-service:${organizationId}] restart failed:`,
						err,
					);
				});
			}
		}, delay);
	}
}

let manager: HostServiceManager | null = null;

export function getHostServiceManager(): HostServiceManager {
	if (!manager) {
		manager = new HostServiceManager();
	}
	return manager;
}
