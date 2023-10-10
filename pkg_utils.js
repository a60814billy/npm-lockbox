"use strict";

const path = require('path');
const fs = require('fs');
const semver = require('semver');
const https = require("https");

const mirrorPath = path.join(__dirname, 'mirror');

const filterDate = new Date('2024-01-01T00:00:00.000Z');

async function isPackageExists(packageName) {
    const packageMetadataPath = path.join(mirrorPath, `${packageName}.json`)
    return fs.existsSync(packageMetadataPath);
}

async function getPackage(packageName) {
    const packageMetadataPath = path.join(mirrorPath, `${packageName}.json`)
    if (!fs.existsSync(packageMetadataPath)) {
        return null;
    }

    const pkgMetaData = JSON.parse(fs.readFileSync(packageMetadataPath).toString());

    if (setPackageMaximumVersion[packageName]) {
        return limitVersionByMaxiumVersion(pkgMetaData, setPackageMaximumVersion[packageName])
    }
    return limitVersionByDate(pkgMetaData, filterDate);
}


const setPackageMaximumVersion = {
    "mkdirp": "1.0.4",
}

function limitVersionByDate(pkgMetaData, freezedDate) {

    const allVersionTimes = pkgMetaData.time
    Object.keys(allVersionTimes).forEach((version) => {
        allVersionTimes[version] = new Date(allVersionTimes[version]);
    });

    const allowedVersions = Object.keys(allVersionTimes).filter((version) => {
        return allVersionTimes[version] < freezedDate;
    })

    const newTime = {};
    const newVersions = {};
    let maxTime = new Date(0);
    let latestVersion = '0.0.0';
    allowedVersions.forEach((version) => {
        if (allVersionTimes[version] > maxTime) {
            maxTime = allVersionTimes[version];
            latestVersion = version;
        }
        if (allVersionTimes[version]) {
            newTime[version] = allVersionTimes[version].toISOString();
        }
        if (pkgMetaData.versions[version]) {
            newVersions[version] = pkgMetaData.versions[version];
        }


    });
    newTime['modified'] = maxTime.toISOString();

    return {
        ...pkgMetaData,
        'dist-tags': {
            latest: latestVersion,
        },
        time: newTime,
        versions: newVersions,
    };
}

function limitVersionByMaxiumVersion(pkgMetaData, maxVersion) {
    const allowedVersions = Object.keys(pkgMetaData.time).filter((version) => {
        if (version === 'modified' || version === 'created') {
            return true;
        }
        return semver.lte(version, maxVersion);
    })

    const newTime = {};
    const newVersions = {};
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
        ...pkgMetaData,
        'dist-tags': {
            latest: latestVersion,
        },
        versions: newVersions,
        time: newTime,
    }
}

function downloadPackage(packageName) {
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
                const pkg = JSON.parse(data);
                const pkgPath = `mirror/${packageName}.json`;

                const dirName = path.dirname(pkgPath);
                if (!fs.existsSync(dirName)) {
                    fs.mkdirSync(dirName);
                }

                fs.writeFileSync(pkgPath, data);
                console.log(`Downloaded ${packageName} to ${pkgPath}`);
                resolve();
            });
        });

        req.on('error', (error) => {
            console.error(error);
            reject(error);
        });

        req.end();
    });
}


exports.isPackageExists = isPackageExists;
exports.getPackage = getPackage;
exports.downloadPackage = downloadPackage;