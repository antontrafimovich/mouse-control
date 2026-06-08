import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { down, left, mouse, right, up } from "@nut-tree/nut-js";

const height = 200;
const width = 200;
const intervalMs = 1000 * 60 * 2;
const host = "localhost";
const port = Number(process.env.PORT) || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, "index.html");

let intervalId = null;
let tunnelProcess = null;
let isShuttingDown = false;

mouse.config.mouseSpeed = 100;

async function moveMouseInSquare() {
  try {
    await mouse.move(down(height));
    await mouse.move(right(width));
    await mouse.move(up(height));
    await mouse.move(left(width));
  } catch (err) {
    console.log(err);
  }
}

function startMouseLoop() {
  if (intervalId) {
    return false;
  }

  intervalId = setInterval(moveMouseInSquare, intervalMs);
  return true;
}

function stopMouseLoop() {
  if (!intervalId) {
    return false;
  }

  clearInterval(intervalId);
  intervalId = null;
  return true;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res, allowedMethods) {
  res.writeHead(405, {
    Allow: allowedMethods.join(", "),
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }

    try {
      const html = await readFile(indexPath, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      console.error("Failed to read index.html:", err);
      sendJson(res, 500, { error: "Failed to load page" });
    }
    return;
  }

  if (url.pathname === "/status") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }

    sendJson(res, 200, { running: Boolean(intervalId) });
    return;
  }

  if (url.pathname === "/start") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"]);
      return;
    }

    const changed = startMouseLoop();
    sendJson(res, 200, { running: true, changed });
    return;
  }

  if (url.pathname === "/stop") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"]);
      return;
    }

    const changed = stopMouseLoop();
    sendJson(res, 200, { running: false, changed });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function startCloudflareTunnel() {
  tunnelProcess = spawn("cloudflared", [
    "tunnel",
    "--url",
    `http://localhost:${port}`,
  ]);

  tunnelProcess.stdout.on("data", (data) => {
    process.stdout.write(`[cloudflared] ${data}`);
  });

  tunnelProcess.stderr.on("data", (data) => {
    process.stderr.write(`[cloudflared] ${data}`);
  });

  tunnelProcess.on("error", (err) => {
    if (err.code === "ENOENT") {
      console.error(
        "cloudflared was not found in PATH. Install it to expose this server through a Cloudflare quick tunnel.",
      );
    } else {
      console.error("Failed to start cloudflared:", err);
    }
    tunnelProcess = null;
  });

  tunnelProcess.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      console.log(`cloudflared exited with code ${code} and signal ${signal}`);
    }
    tunnelProcess = null;
  });
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("Unhandled request error:", err);
    sendJson(res, 500, { error: "Internal server error" });
  });
});

server.on("error", (err) => {
  console.error("Failed to start mouse control server:", err);
  stopMouseLoop();
  process.exit(1);
});

function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  stopMouseLoop();

  if (tunnelProcess) {
    tunnelProcess.kill();
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startMouseLoop();

server.listen(port, host, () => {
  console.log(`Mouse control server listening at http://${host}:${port}`);
  startCloudflareTunnel();
});
