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
const DEPLOYMENT_TARGET = '17.0';
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
  const appVersion = config.version || '1.0.0';
  const iosBuildNumber = config.ios?.buildNumber || '1';
  config = withXcodeProject(config, (cfg) => {
    addWidgetTarget(cfg.modResults, appVersion, iosBuildNumber);
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
      }
      return cfg;
    }

    fs.writeFileSync(podfilePath, patched.join('\n'), 'utf8');
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

  // Assets.xcassets (logo and other widget assets)
  const assetsSrc = path.join(srcDir, 'Assets.xcassets');
  const assetsDst = path.join(widgetTargetDir, 'Assets.xcassets');
  if (fs.existsSync(assetsSrc)) {
    copyDirSync(assetsSrc, assetsDst);
  } else {
    console.warn('[withCartaraIQWidget] Missing assets: ' + assetsSrc);
  }

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

}

// Recursively copy a directory
function copyDirSync(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
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
      // Use addSourceFile which correctly adds the file to both the project
      // and the main target's PBXSourcesBuildPhase in one call.
      // The CartaraIQ PBXGroup has no `path` attribute, so file references
      // must use the full relative path (CartaraIQ/<file>) to resolve correctly.
      project.addSourceFile(`CartaraIQ/${filename}`, {
        lastKnownFileType: fileType,
        sourceTree: '"<group>"',
      }, cartaraiqGroupKey);
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

function addWidgetTarget(project, appVersion, iosBuildNumber) {
  // Guard: skip if target already present
  const nativeTargets = project.pbxNativeTargetSection();
  for (const key of Object.keys(nativeTargets)) {
    const t = nativeTargets[key];
    if (t && typeof t === 'object' && t.name === WIDGET_TARGET) {
      return;
    }
  }


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
    // CODE_SIGN_STYLE intentionally omitted — EAS/fastlane manages signing
    // at build time via the appExtensions config in eas.json.
    MARKETING_VERSION:            `"${appVersion}"`,
    CURRENT_PROJECT_VERSION:      `"${iosBuildNumber}"`,
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
      }
    }
  }

  // ── Add Swift source file ────────────────────────────────────────────────
  // addFile / addFramework with { target } are broken for targets created by
  // addTarget() — they find the main target's existing build phases instead of
  // creating new ones for the widget.  Use addBuildPhase() which correctly
  // creates a new phase AND wires it into the target's buildPhases array.
  let widgetGroupKey = project.findPBXGroupKey({ name: WIDGET_TARGET });
  if (!widgetGroupKey) widgetGroupKey = project.addPbxGroup([], WIDGET_TARGET, WIDGET_TARGET).uuid;

  // Add the Swift file to the group for the file tree
  project.addFile(
    `${WIDGET_TARGET}/CartaraIQWidget.swift`,
    widgetGroupKey,
  );

  // Create a Sources build phase on the widget target with the Swift file
  project.addBuildPhase(
    [`${WIDGET_TARGET}/CartaraIQWidget.swift`],
    'PBXSourcesBuildPhase',
    'Sources',
    targetUuid,
  );

  // ── Add frameworks ────────────────────────────────────────────────────────
  // Create a Frameworks build phase on the widget target
  project.addBuildPhase(
    ['WidgetKit.framework', 'SwiftUI.framework', 'AppIntents.framework'],
    'PBXFrameworksBuildPhase',
    'Frameworks',
    targetUuid,
  );

  // ── Add resources (Assets.xcassets) ───────────────────────────────────────
  project.addBuildPhase(
    [`${WIDGET_TARGET}/Assets.xcassets`],
    'PBXResourcesBuildPhase',
    'Resources',
    targetUuid,
  );

  // Add Assets.xcassets file reference to the widget group
  project.addFile(
    `${WIDGET_TARGET}/Assets.xcassets`,
    widgetGroupKey,
  );

  // Tell the build system where to find the asset catalog
  const buildConfigs2 = project.pbxXCBuildConfigurationSection();
  const configListUuid2 = nativeTargets[targetUuid]?.buildConfigurationList;
  if (configListUuid2) {
    const configList2 = project.pbxXCConfigurationList()[configListUuid2];
    const configRefs2 = configList2?.buildConfigurations || [];
    for (const ref of configRefs2) {
      const cfgUuid = ref.value || ref;
      if (buildConfigs2[cfgUuid]) {
        buildConfigs2[cfgUuid].buildSettings['ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'] = 'YES';
      }
    }
  }

  // ── Embed the widget extension in the main app ───────────────────────────
  embedExtensionInMainTarget(project, targetUuid);

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

  // addTarget() auto-creates a generic "Copy Files" phase on the main target
  // that already contains the widget .appex.  If we also add our own "Embed App
  // Extensions" phase, Xcode sees two tasks copying the same product and fails
  // with "Unexpected duplicate tasks".  Remove the auto-created one first, then
  // create a proper "Embed App Extensions" phase.
  const copyPhaseSection = project.hash.project.objects['PBXCopyFilesBuildPhase'] || {};
  const mainBuildPhases = mainTarget.buildPhases || [];

  // Find and remove all generic "Copy Files" phases that contain the widget .appex
  const widgetProductRef = targets[widgetTargetUuid]?.productReference;
  for (let i = mainBuildPhases.length - 1; i >= 0; i--) {
    const phaseId = mainBuildPhases[i].value || mainBuildPhases[i];
    const phase = copyPhaseSection[phaseId];
    if (!phase || phase.isa !== 'PBXCopyFilesBuildPhase') continue;
    // Skip phases we've already named "Embed App Extensions"
    if (phase.name === '"Embed App Extensions"' || phase.name === 'Embed App Extensions') continue;
    // Check if this phase contains the widget product
    const hasWidget = (phase.files || []).some((f) => {
      const buildFileUuid = f.value || f;
      const bf = project.hash.project.objects['PBXBuildFile']?.[buildFileUuid];
      return bf && (bf.fileRef === widgetProductRef ||
        (bf.fileRef_comment && bf.fileRef_comment.includes(WIDGET_TARGET)));
    });
    if (hasWidget) {
      // Also clean up the orphaned PBXBuildFile entries from this phase
      for (const f of (phase.files || [])) {
        const bfUuid = f.value || f;
        delete project.hash.project.objects['PBXBuildFile']?.[bfUuid];
        delete project.hash.project.objects['PBXBuildFile']?.[bfUuid + '_comment'];
      }
      mainBuildPhases.splice(i, 1);
      delete copyPhaseSection[phaseId];
      delete copyPhaseSection[phaseId + '_comment'];
    }
  }

  // Now check whether an "Embed App Extensions" copy-files phase already exists
  let embedPhaseKey = null;
  for (const bp of mainBuildPhases) {
    const phaseId = bp.value || bp;
    const phase = copyPhaseSection[phaseId];
    if (phase && phase.dstSubfolderSpec === 13) {
      embedPhaseKey = phaseId;
      break;
    }
  }

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
        
        // Create a PBXBuildFile that wraps this product reference
        // This is required by CocoaPods/Xcodeproj type checking
        const crypto = require('crypto');
        const buildFileUuid = crypto.createHash('md5')
          .update('widgetbuild-' + productRefUuid)
          .digest('hex')
          .slice(0, 24)
          .toUpperCase();
        
        // Check if already added to avoid duplicates (check both value and direct UUID)
        const alreadyAdded = embedPhase.files.some(f => {
          const fileUuid = f.value || f;
          return fileUuid === buildFileUuid || fileUuid === productRefUuid;
        });
        
        if (!alreadyAdded) {
          // Check if the PBXBuildFile already exists (defensive check)
          const buildFileSectionExists = project.hash.project.objects['PBXBuildFile'] && 
            project.hash.project.objects['PBXBuildFile'][buildFileUuid];
          
          if (!buildFileSectionExists) {
            // Create the PBXBuildFile object that references the product
            if (!project.hash.project.objects['PBXBuildFile']) {
              project.hash.project.objects['PBXBuildFile'] = {};
            }
            
            project.hash.project.objects['PBXBuildFile'][buildFileUuid] = {
              isa: 'PBXBuildFile',
              fileRef: productRefUuid,
            };
            project.hash.project.objects['PBXBuildFile'][buildFileUuid + '_comment'] = `${WIDGET_TARGET}.appex in Embed App Extensions`;
          }
          
          // Add the build file to the embedding phase
          embedPhase.files.push({
            value: buildFileUuid,
            comment: `${WIDGET_TARGET}.appex in Embed App Extensions`,
          });
        } else {
          console.log(`[withCartaraIQWidget] ${WIDGET_TARGET} already in Embed App Extensions phase — skipping.`);
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
}

function widgetTargetKey(project, targetName) {
  const targets = project.pbxNativeTargetSection();
  return Object.keys(targets).find((k) => {
    const t = targets[k];
    return t && typeof t === 'object' && t.name === targetName;
  });
}

module.exports = withCartaraIQWidget;
