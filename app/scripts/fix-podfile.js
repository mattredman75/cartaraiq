/**
 * fix-podfile.js
 *
 * Injects a post_install hook into ios/Podfile that disables code-signing for
 * CocoaPods resource bundle targets. Required since Xcode 14 signs resource
 * bundles by default, which breaks EAS archive when no dev team is set on them.
 *
 * Called via prebuildCommand in eas.json:
 *   "prebuildCommand": "expo prebuild --no-install && node scripts/fix-podfile.js"
 *
 * Running after expo prebuild guarantees the Podfile exists before we patch it.
 */

const fs   = require('fs');
const path = require('path');

const podfilePath = path.join(__dirname, '..', 'ios', 'Podfile');

if (!fs.existsSync(podfilePath)) {
  console.error('[fix-podfile] ERROR: Podfile not found at ' + podfilePath);
  console.error('[fix-podfile] Make sure this script runs after expo prebuild.');
  process.exit(1);
}

const contents = fs.readFileSync(podfilePath, 'utf8');

if (contents.includes('CODE_SIGNING_ALLOWED')) {
  process.exit(0);
}

const injection = [
  '  # [fix-podfile] Disable code-signing for CocoaPods resource bundle targets.',
  '  # Required since Xcode 14 signs resource bundles by default.',
  '  installer.pods_project.targets.each do |target|',
  "    if target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.bundle'",
  '      target.build_configurations.each do |build_config|',
  "        build_config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'",
  '      end',
  '    end',
  '  end',
].join('\n');

const lines     = contents.split('\n');
const patched   = [];
let   injected  = false;

for (const line of lines) {
  patched.push(line);
  if (!injected && /^\s*post_install\s+do\s+\|/.test(line)) {
    patched.push(injection);
    injected = true;
  }
}

if (!injected) {
  // Expo always generates a post_install block, but handle the edge case anyway
  patched.push('');
  patched.push('post_install do |installer|');
  patched.push(injection);
  patched.push('end');
  patched.push('');
}

fs.writeFileSync(podfilePath, patched.join('\n'), 'utf8');
