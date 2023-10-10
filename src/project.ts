import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import * as semver from "semver";

const mirrorPath = path.join(__dirname, "../mirror");

interface IPackageData {
    name: string;
    description: string;
    "dist-tags": Record<string, string>;
    time: Record<string, string>;
    versions: Record<string, string>;
}

export class Project {
    public projectName: string;
    public lockVersionList: Record<string, string>;
    public lockDate: number;

    constructor() {
        this.projectName = "";
        this.lockVersionList = {};
        this.lockDate = Date.now();
    }

    public addLockVersion(pkgName: string, version: string): void {
        this.lockVersionList[pkgName] = version;
    }

    public isPackageExists(packageName: string): boolean {
        const packageMetadataPath = path.join(mirrorPath, `${packageName}.json`);
        return fs.existsSync(packageMetadataPath);
    }

    public downloadPackage(packageName: string): Promise<{}> {
        return new Promise((resolve, reject) => {
            // console.log(`Download ${packageName}`);
            const options = {
                hostname: "registry.npmjs.org",
                method: "GET",
                path: `/${packageName}`,
                port: 443,
            };

            const req = https.request(options, (res) => {
                // console.log(`statusCode: ${res.statusCode}`);

                let data = "";

                res.on("data", (d) => {
                    data += d;
                });

                res.on("end", () => {
                    const pkgPath = `mirror/${packageName}.json`;

                    const dirName = path.dirname(pkgPath);
                    if (!fs.existsSync(dirName)) {
                        fs.mkdirSync(dirName);
                    }

                    fs.writeFileSync(pkgPath, data);
                    // console.log(`Downloaded ${packageName} to ${pkgPath}`);
                    resolve(undefined);
                });
            });

            req.on("error", (error) => {
                console.error(error);
                reject(error);
            });
            req.end();
        });
    }

    public async getPackage(packageName: string): Promise<IPackageData> {
        if (!this.isPackageExists(packageName)) {
            await this.downloadPackage(packageName);
        }

        const pkgMetaData = JSON.parse(fs.readFileSync(path.join(mirrorPath, `${packageName}.json`)).toString("utf8"));

        if (this.lockVersionList[packageName]) {
            return this.limitVersionByMaximumVersion(pkgMetaData);
        }
        return this.limitVersionByDate(pkgMetaData);
    }

    public limitVersionByDate(pkgMetaData: IPackageData): IPackageData {
        const allVersionTimes: Record<string, string | number | Date> = pkgMetaData.time;
        Object.keys(allVersionTimes).forEach((version) => {
            allVersionTimes[version] = new Date(allVersionTimes[version] as string);
        });

        const allowedVersions = Object.keys(allVersionTimes).filter((version) => {
            return allVersionTimes[version] < this.lockDate;
        });

        const newTime: ITime = {};
        const newVersions: Record<string, string> = {};
        let maxTime = new Date(0);
        let latestVersion = "0.0.0";
        allowedVersions.forEach((version) => {
            if (version !== "modified" && version !== "created") {
                if (allVersionTimes[version] > maxTime.valueOf()) {
                    maxTime = allVersionTimes[version] as Date;
                    latestVersion = version;
                }
            }

            if (allVersionTimes[version]) {
                newTime[version] = (<Date> allVersionTimes[version]).toISOString();
            }
            if (pkgMetaData.versions[version]) {
                newVersions[version] = pkgMetaData.versions[version];
            }
        });
        newTime.modified = maxTime.toISOString();

        return {
            ...pkgMetaData,
            "dist-tags": {
                latest: latestVersion,
            },
            "time": newTime,
            "versions": newVersions,
        };
    }

    public limitVersionByMaximumVersion(pkgMetaData: IPackageData): IPackageData {
        const maxVersion = this.lockVersionList[pkgMetaData.name];
        const allowedVersions = Object.keys(pkgMetaData.time).filter((version) => {
            if (version === "modified" || version === "created") {
                return true;
            }
            return semver.lte(version, maxVersion);
        });

        const newTime: ITime = {};
        const newVersions: Record<string, string> = {};
        let maxTime = new Date(0);
        let latestVersion = "0.0.0";
        allowedVersions.forEach((version) => {
            if (version !== "modified" && version !== "created") {
                if (new Date(pkgMetaData.time[version]).valueOf() > maxTime.valueOf()) {
                    maxTime = new Date(pkgMetaData.time[version]);
                    latestVersion = version;
                }
            }

            if (pkgMetaData.time[version]) {
                newTime[version] = pkgMetaData.time[version];
            }
            if (pkgMetaData.versions[version]) {
                newVersions[version] = pkgMetaData.versions[version];
            }
        });
        newTime.modified = maxTime.toISOString();

        return {
            ...pkgMetaData, "dist-tags": {
                latest: latestVersion,
            },
            "time": newTime,
            "versions": newVersions,
        };
    }
}

interface ITime {
    [key: string]: string;

    "modified"?: string;
    "created"?: string;
}
