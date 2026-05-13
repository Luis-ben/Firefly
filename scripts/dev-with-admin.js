import { spawn } from "node:child_process";
import process from "node:process";

const commands = [
	{ command: "pnpm astro dev --host 127.0.0.1", name: "astro" },
	{ command: "node scripts/admin-server.js", name: "admin" },
];

const children = commands.map(({ command, name }) => {
	const child = spawnCommand(command, {
		env: process.env,
		stdio: "pipe",
	});

	child.stdout.on("data", (chunk) =>
		process.stdout.write(`[${name}] ${chunk}`),
	);
	child.stderr.on("data", (chunk) =>
		process.stderr.write(`[${name}] ${chunk}`),
	);
	child.on("exit", (code) => {
		if (code && code !== 0) {
			console.error(`[${name}] exited with code ${code}`);
			stopAll(code);
		}
	});

	return child;
});

function stopAll(code = 0) {
	for (const child of children) {
		if (!child.killed) child.kill();
	}
	process.exit(code);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

function spawnCommand(command, options) {
	if (process.platform === "win32") {
		return spawn(
			process.env.ComSpec || "cmd.exe",
			["/d", "/s", "/c", command],
			options,
		);
	}

	return spawn("sh", ["-lc", command], options);
}
