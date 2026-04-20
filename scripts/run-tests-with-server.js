/**
 * @fileoverview Runs test suite with automatic local server management.
 * @description If no server responds on localhost:3000/health, start one,
 * wait until healthy, run tests, then stop the server.
 */
import { spawn } from "node:child_process";

const BASE_URL = "http://localhost:3000";
const HEALTH_URL = `${BASE_URL}/health`;
const STARTUP_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 250;

/**
 * Sleep helper.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check whether the app server is healthy.
 * @returns {Promise<boolean>}
 */
const isServerHealthy = async () => {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Spawn a child process and resolve with its exit code.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<number>}
 */
const runProcess = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

let startedServer = null;

try {
  const alreadyRunning = await isServerHealthy();

  if (!alreadyRunning) {
    console.log("[test] No local server on :3000 detected. Starting server...");
    startedServer = spawn(
      process.execPath,
      ["--env-file-if-exists=.env", "server.js"],
      {
        stdio: "inherit",
        env: process.env,
      },
    );

    const startedAt = Date.now();
    let healthy = false;

    while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
      if (startedServer.exitCode !== null) {
        throw new Error("Server exited before tests could start.");
      }

      if (await isServerHealthy()) {
        healthy = true;
        break;
      }

      await wait(POLL_INTERVAL_MS);
    }

    if (!healthy) {
      throw new Error("Server did not become healthy in time.");
    }
  } else {
    console.log("[test] Reusing existing local server on :3000.");
  }

  const exitCode = await runProcess(process.execPath, [
    "--env-file-if-exists=.env",
    "--test",
    "--test-concurrency=1",
  ]);

  process.exitCode = exitCode;
} catch (error) {
  console.error("[test] Failed to run tests:", error.message);
  process.exitCode = 1;
} finally {
  if (startedServer && startedServer.exitCode === null) {
    startedServer.kill("SIGTERM");
    await wait(300);
    if (startedServer.exitCode === null) {
      startedServer.kill("SIGKILL");
    }
  }
}
