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
    disableUserScriptSandboxing(cfg.modResults);
    return cfg;
  });

  // Copy Swift source files into the generated ios/ directory (runs last)
  config = withDangerousMod(config, ['ios', async (cfg) => {
    copyWidgetSources(cfg.modRequest.projectRoot, path.join(cfg.modRequest.projectRoot, 'ios'));
    return cfg;
  }]);

  // Patch Podfile: inject ENABLE_USER_SCRIPT_SANDBOXING=NO and CODE_SIGNING_ALLOWED=NO
  // AFTER react_native_post_install() so we override any value it sets (RN 0.74+ sets
  // sandboxing=YES inside that helper, which would undo an earlier injection).
  // withDangerousMod runs after expo prebuild writes the Podfile, before pod install.
  config = withDangerousMod(config, ['ios', async (cfg) => {
    const podfilePath = path.join(cfg.modRequest.projectRoot, 'ios', 'Podfile');
    if (!fs.existsSync(podfilePath)) return cfg;

    const contents = fs.readFileSync(podfilePath, 'utf8');
    // Use a unique sentinel so this guard is never tripped by RN's own sandboxing line
    if (contents.includes('# [withCartaraIQWidget] sandboxed')) return cfg;

    const injection = [
      '    # [withCartaraIQWidget] sandboxed',
      '    # Xcode 14+: disable code-signing on resource bundle targets',
      '    # Xcode 15+: disable script sandboxing on all targets (fixes Hermes/DevLauncher archive)',
      '    # Must run AFTER react_native_post_install which sets ENABLE_USER_SCRIPT_SANDBOXING=YES',
      '    installer.pods_project.targets.each do |target|',
      '      target.build_configurations.each do |build_config|',
      "        build_config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'",
      "        build_config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'",
      '      end',
      '    end',
    ].join('\n');

    // Inject AFTER the react_native_post_install(...) call closes — that helper sets
    // ENABLE_USER_SCRIPT_SANDBOXING=YES in newer RN versions so we must run after it.
    const lines = contents.split('\n');
    const patched = [];
    let injected = false;
    let inRNCall = false;
    for (const line of lines) {
      patched.push(line);
      if (!injected) {
        if (/react_native_post_install\s*\(/.test(line)) {
          // Single-line call: react_native_post_install(installer)
          if (/\)\s*$/.test(line.trim())) {
            patched.push(injection);
            injected = true;
          } else {
            inRNCall = true;
          }
        } else if (inRNCall && /^\s*\)\s*$/.test(line)) {
          // Closing ) of multi-line react_native_post_install(...)
          patched.push(injection);
          injected = true;
          inRNCall = false;
        }
      }
    }

    // Fallback: if react_native_post_install wasn't found, inject at top of post_install
    if (!injected) {
      console.warn('[withCartaraIQWidget] react_native_post_install not found — using fallback injection');
      const lines2 = contents.split('\n');
      const patched2 = [];
      for (const line of lines2) {
        patched2.push(line);
        if (!injected && /^\s*post_install\s+do\s+\|/.test(line)) {
          patched2.push(injection);
          injected = true;
        }
      }
      if (injected) {
        fs.writeFileSync(podfilePath, patched2.join('\n'), 'utf8');
        console.log('[withCartaraIQWidget] Patched Podfile (fallback) with sandboxing/signing hooks');
      }
      return cfg;
    }

    fs.writeFileSync(podfilePath, patched.join('\n'), 'utf8');
    console.log('[withCartaraIQWidget] Patched Podfile with sandboxing/signing hooks (after react_native_post_install)');
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

// ─── Disable user script sandboxing (Xcode 15+) ──────────────────────────────
// Script phases that don't declare outputs (e.g. Expo Dev Launcher, Hermes)
// cause archive failures under Xcode 15's sandbox. Setting
// ENABLE_USER_SCRIPT_SANDBOXING=NO on all targets resolves this.
function disableUserScriptSandboxing(project) {
  const buildConfigs = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(buildConfigs)) {
    const cfg = buildConfigs[key];
    if (cfg && typeof cfg === 'object' && cfg.buildSettings) {
      cfg.buildSettings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO';
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
  // Extract EXACT signing settings from main app to ensure widget uses identical identity
  const mainTargetKey = Object.keys(nativeTargets).find((k) => {
    const t = nativeTargets[k];
    return t && typeof t === 'object' && t.name !== WIDGET_TARGET && !k.endsWith('_comment');
  });

  let mainAppSigningSettings = {
    DEVELOPMENT_TEAM: 'Q3Q2X7UJGT', // fallback
  };

  if (mainTargetKey) {
    const mainConfigListUuid = nativeTargets[mainTargetKey]?.buildConfigurationList;
    if (mainConfigListUuid) {
      const mainConfigList = project.pbxXCConfigurationList()[mainConfigListUuid];
      const mainConfigRefs = mainConfigList?.buildConfigurations || [];
      const buildConfigs = project.pbxXCBuildConfigurationSection();
      
      // Extract signing settings from main app's Debug config
      for (const ref of mainConfigRefs) {
        const cfgUuid = ref.value || ref;
        const cfg = buildConfigs[cfgUuid];
        if (cfg?.buildSettings) {
          const settings = cfg.buildSettings;
          // Only extract if we find these settings in the main app
          if (settings.DEVELOPMENT_TEAM) {
            mainAppSigningSettings.DEVELOPMENT_TEAM = settings.DEVELOPMENT_TEAM;
          }
          if (settings.CODE_SIGN_IDENTITY) {
            mainAppSigningSettings.CODE_SIGN_IDENTITY = settings.CODE_SIGN_IDENTITY;
          }
          // For automatic signing, use the provisioning profile if set
          if (settings.PROVISIONING_PROFILE_SPECIFIER) {
            mainAppSigningSettings.PROVISIONING_PROFILE_SPECIFIER = settings.PROVISIONING_PROFILE_SPECIFIER;
          }
          break; // Use first config found
        }
      }
    }
  }

  const buildSettings = {
    PRODUCT_BUNDLE_IDENTIFIER:    `"${WIDGET_BUNDLE_ID}"`,
    PRODUCT_NAME:                 `"$(TARGET_NAME)"`,
    SWIFT_VERSION:                SWIFT_VERSION,
    IPHONEOS_DEPLOYMENT_TARGET:   DEPLOYMENT_TARGET,
    TARGETED_DEVICE_FAMILY:       '"1,2"',
    INFOPLIST_FILE:               `"${WIDGET_TARGET}/Info.plist"`,
    CODE_SIGN_ENTITLEMENTS:       `"${WIDGET_TARGET}/${WIDGET_TARGET}.entitlements"`,
    DEVELOPMENT_TEAM:             'Q3Q2X7UJGT',
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
        // Log which config we're setting
        const configName = buildConfigs[cfgUuid].name || cfgUuid;
        console.log(`[withCartaraIQWidget] Applied build settings to ${WIDGET_TARGET} ${configName}`);
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

  // Ensure main app uses same code signing identity (don't re-sign embedded extensions)
  const mainTarget = targets[mainTargetKey];
  const mainConfigListUuid = mainTarget?.buildConfigurationList;
  if (mainConfigListUuid) {
    const configList = project.pbxXCConfigurationList()[mainConfigListUuid];
    const configRefs = configList?.buildConfigurations || [];
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const ref of configRefs) {
      const cfgUuid = ref.value || ref;
      if (buildConfigs[cfgUuid]) {
        // Set build settings to prevent re-signing of embedded extensions
        buildConfigs[cfgUuid].buildSettings = buildConfigs[cfgUuid].buildSettings || {};
        buildConfigs[cfgUuid].buildSettings['CODE_SIGNING_ALLOWED'] = 'YES';
        // Critical: Ensure main app has same DEVELOPMENT_TEAM as widget so certificates match
        buildConfigs[cfgUuid].buildSettings['DEVELOPMENT_TEAM'] = 'Q3Q2X7UJGT';
      }
    }
  }

  // Check whether an "Embed App Extensions" copy-files phase already exists
  const copyFilesSections = project.pbxCopyfilesBuildPhaseObj(mainTargetKey);
  let embedPhaseKey = Object.keys(copyFilesSections || {}).find(
    (k) => copyFilesSections[k]?.dstSubfolderSpec === 13,
  );

  if (!embedPhaseKey) {
    // Add "Embed App Extensions" copy files phase to main target
    const copyPhaseResult = project.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      'Embed App Extensions',
      mainTargetKey,
      'app_extension',
    );
    embedPhaseKey = copyPhaseResult?.uuid;
  }

  // Add the widget product to the embedding phase
  // The widgetTargetUuid is the UUID of the newly-created CartaraIQWidget target.
  // We need to find its productReference to add to the embedding phase.
  if (embedPhaseKey) {
    const embedPhase = project.hash.project.objects['PBXCopyFilesBuildPhase'][embedPhaseKey];
    if (embedPhase) {
      embedPhase.files = embedPhase.files || [];
      
      // The widget target's productReference is generated by xcode library when we called
      // project.addTarget(). It's typically in the format of a UUID reference to the
      // product object. We need to search for it or construct it.
      // For app_extension targets, the product reference is auto-generated.
      // Let's get the widget target that was just created
      const widgetTarget = targets[widgetTargetUuid];
      
      if (widgetTarget && widgetTarget.productReference) {
        const productRefUuid = widgetTarget.productReference;
        
        // Check if already added to avoid duplicates
        const alreadyAdded = embedPhase.files.some(f => 
          (f.value || f) === productRefUuid
        );
        
        if (!alreadyAdded) {
          // Add the product reference to the embedding phase
          embedPhase.files.push({
            value: productRefUuid,
            comment: `${WIDGET_TARGET}.appex in Embed App Extensions`,
          });
          
          console.log(`[withCartaraIQWidget] Added ${WIDGET_TARGET} product (${productRefUuid}) to Embed App Extensions phase`);
        }
      } else {
        // Fallback: if productReference not found, log warning but continue
        console.warn(`[withCartaraIQWidget] Warning: widget target product reference not found for UUID ${widgetTargetUuid}`);
      }
    }
  }

  // Add PBXTargetDependency explicitly — the library's addTargetDependency() silently
  // fails to write PBXContainerItemProxy + PBXTargetDependency sections. Without these
  // entries EAS cannot walk the dependency tree to discover the widget target and will
  // never provision or inject DEVELOPMENT_TEAM for it.
  addExplicitTargetDependency(project, mainTargetKey, widgetTargetUuid);
}

function addExplicitTargetDependency(project, mainTargetKey, widgetTargetUuid) {
  // We need two new UUIDs: one for PBXContainerItemProxy, one for PBXTargetDependency.
  // Use deterministic derivation from the widget UUID so this is idempotent across reruns.
  const crypto = require('crypto');
  const proxyUuid   = crypto.createHash('md5').update('proxy-'   + widgetTargetUuid).digest('hex').slice(0, 24).toUpperCase();
  const depUuid     = crypto.createHash('md5').update('dep-'     + widgetTargetUuid).digest('hex').slice(0, 24).toUpperCase();

  const objects = project.hash.project.objects;

  // Find project root UUID (the PBXProject object)
  const projectUuid = Object.keys(objects['PBXProject'] || {}).find(k => !k.endsWith('_comment'));

  // Create PBXContainerItemProxy section if absent
  if (!objects['PBXContainerItemProxy']) objects['PBXContainerItemProxy'] = {};
  if (!objects['PBXContainerItemProxy'][proxyUuid]) {
    objects['PBXContainerItemProxy'][proxyUuid] = {
      isa: 'PBXContainerItemProxy',
      containerPortal: projectUuid,
      proxyType: 1,
      remoteGlobalIDString: widgetTargetUuid,
      remoteInfo: `"${WIDGET_TARGET}"`,
    };
    objects['PBXContainerItemProxy'][proxyUuid + '_comment'] = 'PBXContainerItemProxy';
  }

  // Create PBXTargetDependency section if absent
  if (!objects['PBXTargetDependency']) objects['PBXTargetDependency'] = {};
  if (!objects['PBXTargetDependency'][depUuid]) {
    objects['PBXTargetDependency'][depUuid] = {
      isa: 'PBXTargetDependency',
      target: widgetTargetUuid,
      targetProxy: proxyUuid,
    };
    objects['PBXTargetDependency'][depUuid + '_comment'] = 'PBXTargetDependency';
  }

  // Wire the dependency into the main target's dependencies array
  const mainTarget = objects['PBXNativeTarget'][mainTargetKey];
  if (mainTarget) {
    if (!mainTarget.dependencies) mainTarget.dependencies = [];
    const alreadyWired = mainTarget.dependencies.some(
      d => (d.value || d) === depUuid
    );
    if (!alreadyWired) {
      mainTarget.dependencies.push({ value: depUuid, comment: 'PBXTargetDependency' });
    }
  }

  console.log(`[withCartaraIQWidget] Wrote PBXTargetDependency (${depUuid}) for ${WIDGET_TARGET}`);
}

function widgetTargetKey(project, targetName) {
  const targets = project.pbxNativeTargetSection();
  return Object.keys(targets).find((k) => {
    const t = targets[k];
    return t && typeof t === 'object' && t.name === targetName;
  });
}

module.exports = withCartaraIQWidget;
