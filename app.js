"use strict";

const {MongoClient} = require("mongodb");
const express = require("express");
const {isPackageExists, getPackage, downloadPackage} = require("./pkg_utils");

class Application {
    constructor(dbUrl) {
        const url = dbUrl || process.env.NPM_LB_DB_STR || 'mongodb://localhost:27017';

        this.client = new MongoClient(url, {
            useUnifiedTopology: true,
        });
        this.db = null;

        this.app = express();

        this.app.get('*', async (req, res) => {
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

    }

    async start() {
        await this.client.connect();
        this.db = this.client.db('npm-lockbox');

        this.app.listen(8080, () => {
            console.log('Server started at port 8080');
        })
    }
}

exports.Application = Application;