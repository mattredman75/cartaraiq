const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function writeBuildInfo() {
  let hash = null;
  try {
    // full 10-char short hash
    hash = execSync("git rev-parse --short=10 HEAD").toString().trim();
  } catch (e) {
    // ignore - git may not be present in CI/dev environment
    hash = null;
  }

  const pkgPath = path.resolve(__dirname, "..", "app", "build-info.json");
  const info = {
    gitCommit: hash,
    timestamp: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(pkgPath, JSON.stringify(info, null, 2));
    console.log("Wrote build info to", pkgPath);
  } catch (err) {
    console.error("Failed to write build info:", err);
    process.exitCode = 1;
  }
}

writeBuildInfo();
