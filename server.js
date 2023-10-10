'use strict';

const path = require('path');
const fs = require('fs');
const semver = require('semver');

const express = require('express');

const {downloadPackage} = require('./get-pkg');


const app = express();

const mirrorPath = path.join(__dirname, 'mirror');

const filterDate = new Date('2020-01-01T00:00:00.000Z');

async function isPackageExists(packageName) {
    const packageMetadataPath = path.join(mirrorPath, `${packageName}.json`)
    return fs.existsSync(packageMetadataPath);
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

app.get('*', async (req, res) => {
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    console.log(fullUrl);

    let pkgName = decodeURIComponent(req.url);
    if (pkgName.endsWith('/')) {
        pkgName = pkgName.substring(0, pkgName.length - 1);
    }
    if (pkgName.startsWith('/')) {
        pkgName = pkgName.substring(1);
    }

    if (pkgName === "") {
        res.status(200).send(`Home`);
        return;
    }

    if (!await isPackageExists(pkgName)) {
        await downloadPackage(pkgName);
    }

    const pkg = await getPackage(pkgName);
    if (pkg) {
        res.json(pkg);
        return;
    }
    res.status(404).send(`package ${pkgName} Not Found`);
});


if (require.main === module) {
    app.listen(8080, () => {
        console.log('Express running on port 8080');
    });
}