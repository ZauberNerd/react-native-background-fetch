const path = require('path');
const fs = require('fs');
const plistParser = require('fast-plist');
const plistWriter = require('plist');

// The getBuildProperty method of the 'xcode' project is a bit naive in that it
// doesn't take a specific target but iterates over all of them and doesn't have
// an exit condition if a property has been found.
// Which in the case of react-native projects usually is the tvOS target because
// it comes last.
function getBuildProperty(project, property) {
    const firstTarget = project.getFirstTarget().firstTarget;
    const configurationList = project.pbxXCConfigurationList()[
        firstTarget.buildConfigurationList
    ];
    const defaultBuildConfiguration = configurationList.buildConfigurations.reduce(
        (acc, config) => {
            const buildSection = project.pbxXCBuildConfigurationSection()[
                config.value
            ];
            return buildSection.name ===
                configurationList.defaultConfigurationName
                ? buildSection
                : acc;
        }
    );

    return defaultBuildConfiguration.buildSettings[property];
}

function getPlistPath(sourceDir, project) {
    const plistFile = getBuildProperty(project, 'INFOPLIST_FILE');
    if (!plistFile) {
        return null;
    }
    return path.join(
        sourceDir,
        plistFile.replace(/"/g, '').replace('$(SRCROOT)', '')
    );
}

function readPlist(sourceDir, project) {
    const plistPath = getPlistPath(sourceDir, project);
    if (!plistPath || !fs.existsSync(plistPath)) {
        return null;
    }
    return plistParser.parse(fs.readFileSync(plistPath, 'utf-8'));
}

function writePlist(sourceDir, project, plist) {
    fs.writeFileSync(
        getPlistPath(sourceDir, project),
        plistWriter.build(plist)
    );
}

// based on: https://github.com/facebook/react-native/blob/545072b/local-cli/link/ios/mapHeaderSearchPaths.js#L5
function eachBuildConfiguration(project, predicate, callback) {
    const config = project.pbxXCBuildConfigurationSection();
    Object
        .keys(config)
        .filter(ref => ref.indexOf('_comment') === -1)
        .filter(ref => predicate(config[ref]))
        .forEach(callback);
}

function hasLCPlusPlus(buildSettings) {
    return Array.isArray(buildSettings.OTHER_LDFLAGS)
        && buildSettings.OTHER_LDFLAGS.indexOf('"-lc++"') >= 0;
}

function addToFrameworkSearchPaths(project, path, recursive) {
    eachBuildConfiguration(
        project,
        hasLCPlusPlus,
        config => {
            const frameworkSearchPaths = config.buildSettings.FRAMEWORK_SEARCH_PATHS
                || ['$(inherited)'];

            const fullPath = path + (recursive ? '/**' : '');

            if (config.buildSettings.FRAMEWORK_SEARCH_PATHS.indexOf(fullPath) === -1) {
                config.buildSettings.FRAMEWORK_SEARCH_PATHS = frameworkSearchPaths.concat(
                    fullPath
                );
            }
        }
    );
}

function removeFromFrameworkSearchPaths(project, path) {
    eachBuildConfiguration(
        project,
        hasLCPlusPlus,
        config => {
            const frameworkSearchPaths = config.buildSettings.FRAMEWORK_SEARCH_PATHS
                || ['"$(inherited)"'];

            config.buildSettings.FRAMEWORK_SEARCH_PATHS = frameworkSearchPaths.filter(
                searchPath => searchPath !== path && searchPath !== path + '/**'
            );
        }
    );
}

function getTargetAttributes(project, target) {
    var attributes = project.getFirstProject()['firstProject']['attributes'];
    target = target || project.getFirstTarget();

    if (attributes['TargetAttributes'] === undefined) {
        attributes['TargetAttributes'] = {};
    }

    if (attributes['TargetAttributes'][target.uuid] === undefined) {
      attributes['TargetAttributes'][target.uuid] = {};
    }

    return attributes['TargetAttributes'][target.uuid];
}

module.exports = {
    getBuildProperty: getBuildProperty,
    getPlistPath: getPlistPath,
    readPlist: readPlist,
    writePlist: writePlist,
    getTargetAttributes: getTargetAttributes,
    addToFrameworkSearchPaths: addToFrameworkSearchPaths,
    removeFromFrameworkSearchPaths: removeFromFrameworkSearchPaths
};
