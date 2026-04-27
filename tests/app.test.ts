import assert from "assert";
import {Express} from "express";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {PassThrough} from "stream";
import {Application} from "@/app";
import {PackageRegistryClient, TarballData} from "@/application/ports";
import {PackageData} from "@/domain/packageMetadata";

interface TestResponse {
    statusCode: number;
    headers: http.OutgoingHttpHeaders;
    body: string;
    json: any;
}

class StubPackageRegistryClient implements PackageRegistryClient {
    public fetchCount = 0;
    public tarballFetchCount = 0;
    public lastTarballUrl = '';

    constructor(private readonly packageMetadata: PackageData) {
    }

    async fetchPackage(packageName: string): Promise<PackageData | null> {
        this.fetchCount += 1;
        if (packageName !== this.packageMetadata.name) {
            return null;
        }

        return this.packageMetadata;
    }

    async fetchTarball(_tarballUrl: string): Promise<TarballData | null> {
        this.tarballFetchCount += 1;
        this.lastTarballUrl = _tarballUrl;

        return {
            content: Buffer.from('package tarball'),
            contentType: 'application/octet-stream',
        };
    }
}

function createPackageData(): PackageData {
    return {
        name: 'express',
        description: 'express package',
        time: {
            created: '2019-01-01T00:00:00.000Z',
            modified: '2021-01-01T00:00:00.000Z',
            '3.21.2': '2019-01-01T00:00:00.000Z',
            '4.0.0': '2020-01-01T00:00:00.000Z',
            '5.0.0': '2021-01-01T00:00:00.000Z',
        },
        versions: {
            '3.21.2': {
                name: 'express',
                version: '3.21.2',
                dist: {
                    tarball: 'https://registry.npmjs.org/express/-/express-3.21.2.tgz',
                },
            },
            '4.0.0': {
                name: 'express',
                version: '4.0.0',
                dist: {
                    tarball: 'https://registry.npmjs.org/express/-/express-4.0.0.tgz',
                },
            },
            '5.0.0': {
                name: 'express',
                version: '5.0.0',
                dist: {
                    tarball: 'https://registry.npmjs.org/express/-/express-5.0.0.tgz',
                },
            },
        },
    };
}

function request(app: Express, method: string, requestPath: string, body?: unknown): Promise<TestResponse> {
    return new Promise((resolve, reject) => {
        const serializedBody = body === undefined ? undefined : JSON.stringify(body);
        const req = new PassThrough() as any;
        req.method = method;
        req.url = requestPath;
        req.originalUrl = requestPath;
        req.headers = {
            host: 'localhost:8080',
            ...(serializedBody ? {
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(serializedBody)),
            } : {}),
        };
        const socket = new PassThrough() as any;
        socket.encrypted = false;
        req.connection = socket;
        req.socket = socket;

        const res = new PassThrough() as any;
        const headers: http.OutgoingHttpHeaders = {};
        const chunks: Buffer[] = [];
        res.statusCode = 200;
        res.statusMessage = 'OK';
        res.headersSent = false;
        res.setHeader = (name: string, value: number | string | string[]) => {
            headers[name.toLowerCase()] = value;
            return res;
        };
        res.getHeader = (name: string) => headers[name.toLowerCase()];
        res.getHeaders = () => headers;
        res.removeHeader = (name: string) => {
            delete headers[name.toLowerCase()];
        };
        res.writeHead = (statusCode: number, headerValues?: http.OutgoingHttpHeaders) => {
            res.statusCode = statusCode;
            if (headerValues) {
                Object.keys(headerValues).forEach((headerName) => {
                    headers[headerName.toLowerCase()] = headerValues[headerName];
                });
            }
            res.headersSent = true;
            return res;
        };
        res.write = (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            return true;
        };
        res.end = (chunk?: Buffer | string) => {
            if (chunk) {
                res.write(chunk);
            }
            res.headersSent = true;
            const responseBody = Buffer.concat(chunks).toString();
            resolve({
                statusCode: res.statusCode || 0,
                headers,
                body: responseBody,
                json: responseBody && String(headers['content-type']).includes('application/json')
                    ? JSON.parse(responseBody)
                    : null,
            });
            return res;
        };

        try {
            req.end(serializedBody);
            (app as any).handle(req, res);
        } catch (error) {
            reject(error);
        }
    });
}

describe('Application', function () {
    it('should create projects and apply project package rules through registry routes', async function () {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-lockbox-app-'));
        const registryClient = new StubPackageRegistryClient(createPackageData());
        const application = new Application(':memory:', cacheDir, registryClient);

        const createProjectResponse = await request(application.getExpressApp(), 'POST', '/projects', {
            name: 'legacy-app',
            lockDate: '2020-12-31T00:00:00.000Z',
        });
        assert.strictEqual(createProjectResponse.statusCode, 201);

        const setMaxVersionResponse = await request(application.getExpressApp(), 'PUT', '/projects/legacy-app/packages/express/max-version', {
            maxVersion: '4.0.0',
        });
        assert.strictEqual(setMaxVersionResponse.statusCode, 200);
        assert.strictEqual(setMaxVersionResponse.json.lockVersionList.express, '4.0.0');

        const packageResponse = await request(application.getExpressApp(), 'GET', '/p/legacy-app/express');
        assert.strictEqual(packageResponse.statusCode, 200);
        assert.strictEqual(packageResponse.json['dist-tags'].latest, '4.0.0');
        assert.strictEqual(packageResponse.json.versions['5.0.0'], undefined);
        assert.strictEqual(
            packageResponse.json.versions['4.0.0'].dist.tarball,
            'http://localhost:8080/p/legacy-app/express/-/express-4.0.0.tgz',
        );
        assert.strictEqual(registryClient.fetchCount, 1);

        application.close();
    });

    it('should return 404 when registry project does not exist', async function () {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-lockbox-app-'));
        const application = new Application(':memory:', cacheDir, new StubPackageRegistryClient(createPackageData()));

        const packageResponse = await request(application.getExpressApp(), 'GET', '/p/missing/express');

        assert.strictEqual(packageResponse.statusCode, 404);

        application.close();
    });

    it('should serve registry-style tarball paths without treating them as package metadata', async function () {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-lockbox-app-'));
        const registryClient = new StubPackageRegistryClient(createPackageData());
        const application = new Application(':memory:', cacheDir, registryClient);

        const tarballResponse = await request(
            application.getExpressApp(),
            'GET',
            '/p/legacy-app/express/-/express-4.0.0.tgz',
        );

        assert.strictEqual(tarballResponse.statusCode, 200);
        assert.strictEqual(tarballResponse.headers['content-type'], 'application/octet-stream');
        assert.strictEqual(tarballResponse.body, 'package tarball');
        assert.strictEqual(registryClient.fetchCount, 0);
        assert.strictEqual(registryClient.tarballFetchCount, 1);
        assert.strictEqual(
            registryClient.lastTarballUrl,
            'https://registry.npmjs.org/express/-/express-4.0.0.tgz',
        );

        application.close();
    });
});
