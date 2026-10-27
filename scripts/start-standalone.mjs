// Runs the production build the way the Docker image does: the standalone server plus its static files.
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const out = ".next/standalone";
if (!existsSync(`${out}/server.js`)) throw new Error("Run `npm run build` first.");
cpSync(".next/static", `${out}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${out}/public`, { recursive: true });

const port = process.argv.includes("-p") ? process.argv[process.argv.indexOf("-p") + 1] : process.env.PORT ?? "3000";
spawn("node", [`${out}/server.js`], { stdio: "inherit", env: { ...process.env, PORT: port, HOSTNAME: "0.0.0.0" } });
