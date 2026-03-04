/**
 * Expo Config Plugin: withCartaraIQWidget
 *
 * Adds the CartaraIQWidget WidgetKit extension to the Xcode project during
 * `expo prebuild` / EAS Build. Safe to run multiple times (idempotent).
 *
 * What it does:
 *  1. Adds App Groups entitlement to the main app target
 *  2. Adds a new "CartaraIQWidget" app_extension target to the .xcodeproj
 *  3. Wires CartaraIQWidget.swift + Info.plist + .entitlements into the target
 *  4. Sets all required build settings (bundle ID, Swift version, WidgetKit, etc.)
 *  5. Embeds the extension into the main app via a "Copy Files" build phase
 */

const { withXcodeProject, withEntitlementsPlist, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const WIDGET_TARGET     = 'CartaraIQWidget';
const WIDGET_BUNDLE_ID  = 'com.cartaraiq.app.widget';
const APP_GROUP_ID      = 'group.com.cartaraiq.app';
const DEPLOYMENT_TARGET = '16.0';
const SWIFT_VERSION     = '5.0';

// ─── Entry point ──────────────────────────────────────────────────────────────

function withCartaraIQWidget(config) {
  // Add App Groups entitlement to main app
  config = withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults['com.apple.security.application-groups'] || [];
    if (!groups.includes(APP_GROUP_ID)) {
      cfg.modResults['com.apple.security.application-groups'] = [...groups, APP_GROUP_ID];
    }
    return cfg;
  });

  // Add widget target + SharedDataModule to the Xcode project
  config = withXcodeProject(config, (cfg) => {
    addWidgetTarget(cfg.modResults);
    addSharedDataModuleToMainTarget(cfg.modResults);
    return cfg;
  });

  // Copy Swift source files into the generated ios/ directory (runs last)
  config = withDangerousMod(config, ['ios', async (cfg) => {
    copyWidgetSources(cfg.modRequest.projectRoot, path.join(cfg.modRequest.projectRoot, 'ios'));
    return cfg;
  }]);

  // Patch Podfile: inject CODE_SIGNING_ALLOWED=NO into the existing post_install
  // block so CocoaPods resource bundle targets are not signed (Xcode 14+ requirement).
  // withDangerousMod runs after expo prebuild writes the Podfile, before pod install.
  config = withDangerousMod(config, ['ios', async (cfg) => {
    const podfilePath = path.join(cfg.modRequest.projectRoot, 'ios', 'Podfile');
    if (!fs.existsSync(podfilePath)) return cfg;

    const contents = fs.readFileSync(podfilePath, 'utf8');
    if (contents.includes('CODE_SIGNING_ALLOWED')) return cfg;

    const injection = [
      '    # Disable code-signing for CocoaPods resource bundle targets (Xcode 14+)',
      '    installer.pods_project.targets.each do |target|',
      "      if target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.bundle'",
      '        target.build_configurations.each do |build_config|',
      "          build_config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'",
      '        end',
      '      end',
      '    end',
    ].join('\n');

    const lines = contents.split('\n');
    const patched = [];
    let injected = false;
    for (const line of lines) {
      patched.push(line);
      if (!injected && /^\s*post_install\s+do\s+\|/.test(line)) {
        patched.push(injection);
        injected = true;
      }
    }
    if (injected) {
      fs.writeFileSync(podfilePath, patched.join('\n'), 'utf8');
      console.log('[withCartaraIQWidget] Patched Podfile with CODE_SIGNING_ALLOWED hook');
    }
    return cfg;
  }]);

  return config;
}

// ─── File copying ─────────────────────────────────────────────────────────────

function copyWidgetSources(projectRoot, iosDir) {
  const srcDir          = path.join(projectRoot, 'widget-src');
  const widgetTargetDir = path.join(iosDir, WIDGET_TARGET);
  const mainTargetDir   = path.join(iosDir, 'CartaraIQ');

  if (!fs.existsSync(widgetTargetDir)) fs.mkdirSync(widgetTargetDir, { recursive: true });

  // CartaraIQWidget.swift
  const swiftSrc = path.join(srcDir, 'CartaraIQWidget.swift');
  if (fs.existsSync(swiftSrc)) fs.copyFileSync(swiftSrc, path.join(widgetTargetDir, 'CartaraIQWidget.swift'));
  else console.warn('[withCartaraIQWidget] Missing source: ' + swiftSrc);

  // SharedDataModule files
  ['SharedDataModule.swift', 'SharedDataModule.m'].forEach((f) => {
    const src = path.join(srcDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(mainTargetDir, f));
    else console.warn('[withCartaraIQWidget] Missing source: ' + src);
  });

  // Widget entitlements (generated)
  fs.writeFileSync(path.join(widgetTargetDir, WIDGET_TARGET + '.entitlements'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict>\n' +
    '  <key>com.apple.security.application-groups</key>\n' +
    '  <array><string>' + APP_GROUP_ID + '</string></array>\n' +
    '</dict></plist>\n'
  );

  // Widget Info.plist (generated)
  fs.writeFileSync(path.join(widgetTargetDir, 'Info.plist'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict>\n' +
    '  <key>CFBundleDevelopmentRegion</key><string>$(DEVELOPMENT_LANGUAGE)</string>\n' +
    '  <key>CFBundleDisplayName</key><string>CartaraIQ</string>\n' +
    '  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>\n' +
    '  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>\n' +
    '  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>\n' +
    '  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>\n' +
    '  <key>CFBundlePackageType</key><string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>\n' +
    '  <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>\n' +
    '  <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>\n' +
    '  <key>NSExtension</key><dict>\n' +
    '    <key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string>\n' +
    '  </dict>\n' +
    '</dict></plist>\n'
  );

  console.log('[withCartaraIQWidget] Widget sources written to ios/' + WIDGET_TARGET + '/');
}

// ─── Xcode project manipulation ───────────────────────────────────────────────

function addSharedDataModuleToMainTarget(project) {
  const mainTargetKey = Object.keys(project.pbxNativeTargetSection()).find((k) => {
    const t = project.pbxNativeTargetSection()[k];
    return t && typeof t === 'object' && t.name !== WIDGET_TARGET && !k.endsWith('_comment');
  });
  if (!mainTargetKey) return;

  // The xcode library crashes in getPBXVariantGroupByKey when the
  // PBXVariantGroup section is absent from the pbxproj.  Create it
  // defensively so the lookup never hits an undefined object.
  if (!project.hash.project.objects['PBXVariantGroup']) {
    project.hash.project.objects['PBXVariantGroup'] = {};
  }

  // Prefer adding files into the CartaraIQ PBXGroup rather than passing
  // null (which causes the library to search for a group and crash).
  const pbxGroups = project.hash.project.objects['PBXGroup'] || {};
  const cartaraiqGroupKey = Object.keys(pbxGroups).find((k) => {
    const g = pbxGroups[k];
    return g && typeof g === 'object' && !k.endsWith('_comment') &&
           (g.name === 'CartaraIQ' || g.path === 'CartaraIQ');
  }) || null;

  const buildFiles = project.pbxBuildFileSection();
  for (const [filename, fileType] of [
    ['SharedDataModule.swift', 'sourcecode.swift'],
    ['SharedDataModule.m',     'sourcecode.c.objc'],
  ]) {
    const alreadyAdded = Object.values(buildFiles).some(
      (bf) => bf && typeof bf === 'object' && bf.fileRef_comment && bf.fileRef_comment.includes(filename),
    );
    if (!alreadyAdded) {
      const fileRef = project.addFile(filename, cartaraiqGroupKey, {
        target: mainTargetKey,
        lastKnownFileType: fileType,
        sourceTree: '"<group>"',
      });
      if (fileRef) project.addToPbxSourcesBuildPhase(fileRef, mainTargetKey);
    }
  }
}

function addWidgetTarget(project) {
  // Guard: skip if target already present
  const nativeTargets = project.pbxNativeTargetSection();
  for (const key of Object.keys(nativeTargets)) {
    const t = nativeTargets[key];
    if (t && typeof t === 'object' && t.name === WIDGET_TARGET) {
      console.log(`[withCartaraIQWidget] Target "${WIDGET_TARGET}" already exists — skipping.`);
      return;
    }
  }

  console.log(`[withCartaraIQWidget] Adding "${WIDGET_TARGET}" target…`);

  // ── Create the native target ─────────────────────────────────────────────
  const targetResult = project.addTarget(
    WIDGET_TARGET,
    'app_extension',
    WIDGET_TARGET,
    WIDGET_BUNDLE_ID,
  );
  const targetUuid = targetResult.uuid;

  // ── Build settings for both Debug & Release ──────────────────────────────
  const buildSettings = {
    PRODUCT_BUNDLE_IDENTIFIER:    `"${WIDGET_BUNDLE_ID}"`,
    PRODUCT_NAME:                 `"$(TARGET_NAME)"`,
    SWIFT_VERSION:                SWIFT_VERSION,
    IPHONEOS_DEPLOYMENT_TARGET:   DEPLOYMENT_TARGET,
    TARGETED_DEVICE_FAMILY:       '"1,2"',
    INFOPLIST_FILE:               `"${WIDGET_TARGET}/Info.plist"`,
    CODE_SIGN_ENTITLEMENTS:       `"${WIDGET_TARGET}/${WIDGET_TARGET}.entitlements"`,
    MARKETING_VERSION:            '"$(MARKETING_VERSION)"',
    CURRENT_PROJECT_VERSION:      '"$(CURRENT_PROJECT_VERSION)"',
    SKIP_INSTALL:                 'YES',
    ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: 'NO',
    APPLICATION_EXTENSION_API_ONLY: 'YES',
    CLANG_ENABLE_MODULES:         'YES',
    SWIFT_OPTIMIZATION_LEVEL:     '"-Onone"',
  };

  // Apply to both Debug and Release configs created by addTarget
  const configListUuid = nativeTargets[targetUuid]?.buildConfigurationList;
  if (configListUuid) {
    const configList = project.pbxXCConfigurationList()[configListUuid];
    const configRefs = configList?.buildConfigurations || [];
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const ref of configRefs) {
      const cfgUuid = ref.value || ref;
      if (buildConfigs[cfgUuid]) {
        buildConfigs[cfgUuid].buildSettings = {
          ...buildConfigs[cfgUuid].buildSettings,
          ...buildSettings,
        };
      }
    }
  }

  // ── Add Swift source file ────────────────────────────────────────────────
  let widgetGroupKey = project.findPBXGroupKey({ name: WIDGET_TARGET });
  if (!widgetGroupKey) widgetGroupKey = project.addPbxGroup([], WIDGET_TARGET, WIDGET_TARGET).uuid;
  const swiftFile = project.addFile(
    `${WIDGET_TARGET}/CartaraIQWidget.swift`,
    widgetGroupKey,
    { target: targetUuid },
  );
  if (swiftFile) {
    project.addToPbxSourcesBuildPhase(swiftFile, targetUuid);
  }

  // ── Add WidgetKit.framework ──────────────────────────────────────────────
  project.addFramework('WidgetKit.framework', { target: targetUuid });
  project.addFramework('SwiftUI.framework',   { target: targetUuid });

  // ── Embed the widget extension in the main app ───────────────────────────
  embedExtensionInMainTarget(project, targetUuid);

  console.log(`[withCartaraIQWidget] Done ✓`);
}

function embedExtensionInMainTarget(project, widgetTargetUuid) {
  // Find the main app target (first native target that is NOT our widget)
  const targets      = project.pbxNativeTargetSection();
  const mainTargetKey = Object.keys(targets).find((k) => {
    const t = targets[k];
    return (
      t &&
      typeof t === 'object' &&
      t.name !== WIDGET_TARGET &&
      t.name !== `${WIDGET_TARGET}_comment`
    );
  });

  if (!mainTargetKey) return;

  // Check whether an "Embed App Extensions" copy-files phase already exists
  const mainTarget        = targets[mainTargetKey];
  const copyFilesSections = project.pbxCopyfilesBuildPhaseObj(mainTargetKey);
  const alreadyEmbedded   = Object.values(copyFilesSections || {}).some(
    (p) => p?.dstSubfolderSpec === 13,
  );

  if (!alreadyEmbedded) {
    // Build the file reference for the widget product
    const widgetProductRef = { value: widgetTargetUuid, comment: `${WIDGET_TARGET}` };

    // Add "Embed App Extensions" copy files phase to main target
    const copyPhaseResult = project.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      'Embed App Extensions',
      mainTargetKey,
      'app_extension',
    );

    // Wire the widget product into the copy phase
    if (copyPhaseResult?.buildPhase) {
      copyPhaseResult.buildPhase.files = copyPhaseResult.buildPhase.files || [];
      const productUuid = widgetTargetKey(project, WIDGET_TARGET);
      if (productUuid) {
        copyPhaseResult.buildPhase.files.push({
          value: productUuid,
          comment: `${WIDGET_TARGET} in Embed App Extensions`,
        });
      }
    }
  }

  // Add target dependency on main target
  project.addTargetDependency(mainTargetKey, [widgetTargetUuid]);
}

function widgetTargetKey(project, targetName) {
  const targets = project.pbxNativeTargetSection();
  return Object.keys(targets).find((k) => {
    const t = targets[k];
    return t && typeof t === 'object' && t.name === targetName;
  });
}

module.exports = withCartaraIQWidget;
