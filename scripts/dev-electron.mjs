import { spawn } from "node:child_process";
import http from "node:http";

const vite = spawn("npx", ["vite", "--host", "127.0.0.1"], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

function waitForVite() {
  return new Promise((resolve) => {
    const check = () => {
      const request = http.get("http://127.0.0.1:5173", (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => setTimeout(check, 250));
    };
    check();
  });
}

await waitForVite();

await new Promise((resolve, reject) => {
  const tsc = spawn("npm", ["run", "build:main"], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  tsc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build:main exited with ${code}`))));
});

const electron = spawn("npx", ["electron", "."], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: "http://127.0.0.1:5173"
  }
});

electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
