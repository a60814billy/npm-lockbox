import path from "path";
import fs from "fs";
import semver from "semver";
import https from "https";

const mirrorPath = path.join(__dirname, 'mirror');

interface PackageData {
    name: string,
    description: string,
    time: Record<string, string>
    versions: Record<string, string>
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

    addLockVersion(pkgName: string, version: string) {
        this.lockVersionList[pkgName] = version;
    }


    isPackageExists(packageName: string) {
        const packageMetadataPath = path.join(mirrorPath, `${packageName}.json`);
        return fs.existsSync(packageMetadataPath);
    }


    downloadPackage(packageName: string) {
        return new Promise((resolve, reject) => {
            console.log(`Download ${packageName}`);
            const options = {
                hostname: 'registry.npmjs.org',
                port: 443,
                path: `/${packageName}`,
                method: 'GET',
            };

            const req = https.request(options, (res) => {
                console.log(`statusCode: ${res.statusCode}`);

                let data = '';

                res.on('data', (d) => {
                    data += d;
                });

                res.on('end', () => {
                    const pkgPath = `mirror/${packageName}.json`;

                    const dirName = path.dirname(pkgPath);
                    if (!fs.existsSync(dirName)) {
                        fs.mkdirSync(dirName);
                    }

                    fs.writeFileSync(pkgPath, data);
                    console.log(`Downloaded ${packageName} to ${pkgPath}`);
                    resolve(null);
                });
            });

            req.on('error', (error) => {
                console.error(error);
                reject(error);
            });
            req.end();
        });
    }

    async getPackage(packageName: string) {
        if (!this.isPackageExists(packageName)) {
            await this.downloadPackage(packageName);
        }

        const pkgMetaData = JSON.parse(fs.readFileSync(path.join(mirrorPath, `${packageName}.json`)).toString('utf8'));

        if (this.lockVersionList[packageName]) {
            return this.limitVersionByMaximumVersion(pkgMetaData)
        }
        return this.limitVersionByDate(pkgMetaData);
    }

    limitVersionByDate(pkgMetaData: PackageData) {
        const allVersionTimes: Record<string, string | number | Date> = pkgMetaData.time
        Object.keys(allVersionTimes).forEach((version) => {
            allVersionTimes[version] = new Date(allVersionTimes[version]);
        });

        const allowedVersions = Object.keys(allVersionTimes).filter((version) => {
            return allVersionTimes[version] < this.lockDate;
        })

        const newTime: Record<string, string> = {};
        const newVersions: Record<string, string> = {};
        let maxTime = new Date(0);
        let latestVersion = '0.0.0';
        allowedVersions.forEach((version) => {
            if (version !== 'modified' && version !== 'created') {
                if (allVersionTimes[version] > maxTime.valueOf()) {
                    maxTime = allVersionTimes[version] as Date;
                    latestVersion = version;
                }
            }

            if (allVersionTimes[version]) {
                newTime[version] = (<Date>allVersionTimes[version]).toISOString();
            }
            if (pkgMetaData.versions[version]) {
                newVersions[version] = pkgMetaData.versions[version];
            }


        });
        newTime['modified'] = maxTime.toISOString();

        return {
            ...pkgMetaData, 'dist-tags': {
                latest: latestVersion,
            }, time: newTime, versions: newVersions,
        };
    }

    limitVersionByMaximumVersion(pkgMetaData: PackageData) {
        const maxVersion = this.lockVersionList[pkgMetaData.name];
        const allowedVersions = Object.keys(pkgMetaData.time).filter((version) => {
            if (version === 'modified' || version === 'created') {
                return true;
            }
            return semver.lte(version, maxVersion);
        })

        const newTime: Record<string, string> = {};
        const newVersions: Record<string, string> = {};
        let maxTime = new Date(0);
        let latestVersion = '0.0.0';
        allowedVersions.forEach((version) => {
            if (version !== 'modified' && version !== 'created') {
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
        newTime['modified'] = maxTime.toISOString();

        return {
            ...pkgMetaData, 'dist-tags': {
                latest: latestVersion,
            }, versions: newVersions, time: newTime,
        }
    }
}
