import semver from "semver";
import {PackageData, PackageVersion} from "./packageMetadata";

export interface ProjectSnapshot {
    projectName: string;
    lockDate: number;
    lockVersionList: Record<string, string>;
    ignoreVersionList?: Record<string, string[]>;
}

export class Project {
    public projectName: string;
    public lockVersionList: Record<string, string>;
    public lockDate: number;
    public ignoreVersionList: Record<string, string[]>

    constructor(snapshot?: Partial<ProjectSnapshot>) {
        this.projectName = snapshot?.projectName ?? "";
        this.lockVersionList = snapshot?.lockVersionList ?? {};
        this.lockDate = snapshot?.lockDate ?? Date.now();
        this.ignoreVersionList = snapshot?.ignoreVersionList ?? {};
    }

    addLockVersion(pkgName: string, version: string) {
        this.lockVersionList[pkgName] = version;
    }

    addIgnoreVersion(pkgName: string, version: string) {
        if (!this.ignoreVersionList[pkgName]) {
            this.ignoreVersionList[pkgName] = [];
        }
        this.ignoreVersionList[pkgName].push(version);
    }

    limitPackage(pkgMetaData: PackageData) {
        let allowedVersions = Object.keys(pkgMetaData.versions).filter((version) => {
            if (semver.valid(version) === null) {
                return false;
            }

            const releasedAt = pkgMetaData.time[version];
            if (!releasedAt || new Date(releasedAt).valueOf() > this.lockDate) {
                return false;
            }

            const maxVersion = this.lockVersionList[pkgMetaData.name];
            if (maxVersion && semver.gt(version, maxVersion)) {
                return false;
            }

            return true;
        });

        this.ignoreVersionList[pkgMetaData.name]?.forEach((version) => {
            allowedVersions = allowedVersions.filter((allowedVersion) => {
                return allowedVersion !== version;
            });
        });

        allowedVersions.sort((a, b) => semver.compare(a, b));

        const newTime: Record<string, string> = {};
        const newVersions: Record<string, PackageVersion> = {};

        const createdTime = pkgMetaData.time.created;
        if (createdTime) {
            newTime.created = createdTime;
        }

        allowedVersions.forEach((version) => {
            newTime[version] = pkgMetaData.time[version];
            newVersions[version] = pkgMetaData.versions[version];
        });

        const latestVersion = allowedVersions[allowedVersions.length - 1] || "0.0.0";
        newTime.modified = latestVersion === "0.0.0" ? new Date(0).toISOString() : pkgMetaData.time[latestVersion];

        return {
            ...pkgMetaData,
            'dist-tags': {
                ...pkgMetaData['dist-tags'],
                latest: latestVersion,
            },
            time: newTime,
            versions: newVersions,
        };
    }

    toSnapshot(): ProjectSnapshot {
        return {
            projectName: this.projectName,
            lockDate: this.lockDate,
            lockVersionList: {...this.lockVersionList},
            ignoreVersionList: {...this.ignoreVersionList},
        };
    }
}
