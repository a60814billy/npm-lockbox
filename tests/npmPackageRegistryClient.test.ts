import assert from "assert";
import http from "http";
import {AddressInfo} from "net";
import {NpmPackageRegistryClient} from "@/infrastructure/npm/npmPackageRegistryClient";

function listen(server: http.Server): Promise<string> {
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as AddressInfo;
            resolve(`http://127.0.0.1:${address.port}/`);
        });
    });
}

function close(server: http.Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

describe('NpmPackageRegistryClient', function () {
    it('should reject package metadata responses that are not JSON', async function () {
        const server = http.createServer((_req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end('<html>maintenance page</html>');
        });
        const registryUrl = await listen(server);

        try {
            const client = new NpmPackageRegistryClient(registryUrl);

            await assert.rejects(
                () => client.fetchPackage('left-pad'),
                /expected JSON response, got text\/html/,
            );
        } finally {
            await close(server);
        }
    });

    it('should reject invalid JSON package metadata with context', async function () {
        const server = http.createServer((_req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end('not json');
        });
        const registryUrl = await listen(server);

        try {
            const client = new NpmPackageRegistryClient(registryUrl);

            await assert.rejects(
                () => client.fetchPackage('left-pad'),
                /Failed to parse package metadata for left-pad/,
            );
        } finally {
            await close(server);
        }
    });
});
