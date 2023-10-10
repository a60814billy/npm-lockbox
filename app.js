"use strict";

const {MongoClient} = require("mongodb");
const express = require("express");

const {Project} = require('./project')

class Application {
    constructor(dbUrl) {
        const url = dbUrl || process.env.NPM_LB_DB_STR || 'mongodb://localhost:27017';

        this.client = new MongoClient(url, {
            useUnifiedTopology: true,
        });
        this.db = null;

        this.app = express();

        const project = new Project();
        project.projectName = "default-project";
        project.lockDate = new Date('2020-01-01T00:00:00.000Z');
        project.addLockVersion('jquery', '3.0.0');

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

            const pkg = await project.getPackage(pkgName)
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