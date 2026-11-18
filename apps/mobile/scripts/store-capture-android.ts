/// <reference types="node" />
// `pnpm --filter mobile store:capture:android`
// Runs the store screenshot flow on a local Android emulator (spec 0060).
// Needs a running emulator, the Maestro CLI, and apps/mobile/.env.screenshots.local
// (gitignored) holding the Android demo account:
//   MAESTRO_DEMO_EMAIL=screenshots-android@bartendingapp.dev
//   MAESTRO_DEMO_PASSWORD=...
// Install the `screenshots` profile APK on the emulator first.
// Captures land in apps/mobile/store/.captures/android/<locale>/.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvFile } from "../store/env-file";

// Maestro runs from the Expo project folder, the same place EAS jobs start, so
// the flow's relative capture paths resolve the same way in both.
const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(MOBILE_DIR, ".env.screenshots.local");
const FLOW = ".maestro/screenshots/capture-all.yaml";
const REQUIRED_KEYS = ["MAESTRO_DEMO_EMAIL", "MAESTRO_DEMO_PASSWORD"] as const;

function fail(message: string): never {
  console.error(`store:capture:android: ${message}`);
  process.exit(1);
}

const run = (command: string, args: readonly string[]): SpawnSyncReturns<string> =>
  spawnSync(command, args, { cwd: MOBILE_DIR, encoding: "utf8", stdio: "pipe", shell: false });

const adbShell = (...args: readonly string[]): SpawnSyncReturns<string> =>
  run("adb", ["shell", ...args]);

// The status bar shown in every capture: 9:41, full battery and signal, no
// notification icons.
const DEMO_MODE_COMMANDS: readonly (readonly string[])[] = [
  ["enter"],
  ["clock", "-e", "hhmm", "0941"],
  ["battery", "-e", "level", "100", "-e", "plugged", "false"],
  ["network", "-e", "wifi", "show", "-e", "level", "4"],
  ["network", "-e", "mobile", "show", "-e", "datatype", "none", "-e", "level", "4"],
  ["notifications", "-e", "visible", "false"],
];

const demoMode = (command: readonly string[]): void => {
  const [name, ...extras] = command;
  adbShell(
    "am",
    "broadcast",
    "-a",
    "com.android.systemui.demo",
    "-e",
    "command",
    name ?? "",
    ...extras,
  );
};

if (!existsSync(ENV_FILE)) {
  fail(`missing ${ENV_FILE}. Add ${REQUIRED_KEYS.join(" and ")} for the Android demo account.`);
}
const env = parseEnvFile(readFileSync(ENV_FILE, "utf8"));
const missing = REQUIRED_KEYS.filter((key) => !env[key]);
if (missing.length > 0) fail(`${ENV_FILE} is missing ${missing.join(", ")}.`);

const devices = run("adb", ["devices"]);
if (devices.error) fail("adb was not found. Install the Android SDK platform tools.");
const online = devices.stdout
  .split(/\r?\n/)
  .slice(1)
  .filter((line) => /\tdevice$/.test(line.trim()));
if (online.length === 0) fail("no Android device or emulator is running.");

// Emulators can drop back to light mode, so set it on every run.
adbShell("cmd", "uimode", "night", "yes");
adbShell("settings", "put", "global", "sysui_demo_allowed", "1");
DEMO_MODE_COMMANDS.forEach(demoMode);

const result = (() => {
  try {
    return spawnSync(
      "maestro",
      [
        "test",
        "-e",
        `MAESTRO_DEMO_EMAIL=${env.MAESTRO_DEMO_EMAIL}`,
        "-e",
        `MAESTRO_DEMO_PASSWORD=${env.MAESTRO_DEMO_PASSWORD}`,
        "-e",
        "MAESTRO_PLATFORM=android",
        FLOW,
      ],
      // Windows installs maestro as a .bat, which needs a shell to launch.
      { cwd: MOBILE_DIR, stdio: "inherit", shell: process.platform === "win32" },
    );
  } finally {
    demoMode(["exit"]);
  }
})();

if (result.error)
  fail(`could not start maestro (${result.error.message}). Install the Maestro CLI.`);
process.exit(result.status ?? 1);
