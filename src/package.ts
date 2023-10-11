import semver from "semver";

export function resolveMinimalVersion(versionList: string[], requiredVersion: string): string {
    const satisfyVersions = versionList.filter((version) => {
        return semver.satisfies(version, requiredVersion);
    });

    satisfyVersions.sort((a, b) => {
        return semver.compare(a, b);
    });

    return satisfyVersions[0];
}
