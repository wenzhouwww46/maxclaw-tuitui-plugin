import { mkdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

function ownerPid(path) {
  try { return Number(readFileSync(path, "utf8")); } catch { return null; }
}

function unlinkIfOwned(path, pid) {
  if (ownerPid(path) !== pid) return;
  try { unlinkSync(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}

export function acquireListenerSingleton(dataDir, pid = process.pid) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const lockDir = join(dataDir, "listener.lock");
  const ownerFile = join(lockDir, "owner.pid");
  const pidFile = join(dataDir, "listener.pid");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(lockDir, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = ownerPid(ownerFile);
      if (alive(owner)) return null;
      // Another process may have just created the lock and not written its PID yet.
      if (!owner && Date.now() - statSync(lockDir).mtimeMs < 5_000) return null;
      try {
        if (owner) unlinkIfOwned(ownerFile, owner);
        rmdirSync(lockDir);
      } catch { return null; }
      if (attempt === 1) return null;
    }
  }
  try {
    writeFileSync(ownerFile, `${pid}\n`, { flag: "wx", mode: 0o600 });
    const temporary = `${pidFile}.${pid}.tmp`;
    writeFileSync(temporary, `${pid}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, pidFile);
  } catch (error) {
    unlinkIfOwned(ownerFile, pid);
    try { rmdirSync(lockDir); } catch {}
    throw error;
  }
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      unlinkIfOwned(pidFile, pid);
      unlinkIfOwned(ownerFile, pid);
      try { rmdirSync(lockDir); } catch (error) { if (error?.code !== "ENOENT" && error?.code !== "ENOTEMPTY") throw error; }
    },
  };
}
