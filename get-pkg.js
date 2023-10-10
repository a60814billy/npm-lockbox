'use strict';

const path = require('path');
const https = require('https');
const fs = require('fs');

function getPackage(packageName) {
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

exports.downloadPackage = getPackage;

if (require.main === module) {
    const pkgName = process.argv[2];
    getPackage(pkgName);
}

