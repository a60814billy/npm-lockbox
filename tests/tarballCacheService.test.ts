import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import {TarballCacheService} from "@/application/tarballCacheService";
import {PackageRegistryClient} from "@/application/ports";
import {PackageData} from "@/domain/packageMetadata";
import {FileSystemTarballCache} from "@/infrastructure/filesystem/fileSystemTarballCache";

class StubPackageRegistryClient implements PackageRegistryClient {
    public tarballFetchCount = 0;

    async fetchPackage(_packageName: string): Promise<PackageData | null> {
        return null;
    }

    async fetchTarball(_tarballUrl: string) {
        this.tarballFetchCount += 1;

        return {
            content: Buffer.from('cached package'),
            contentType: 'application/octet-stream',
        };
    }
}

describe('TarballCacheService', function () {
    it('should fetch tarballs once and then return the cached copy', async function () {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-lockbox-tarball-'));
        const registryClient = new StubPackageRegistryClient();
        const service = new TarballCacheService(
            new FileSystemTarballCache(cacheDir),
            registryClient,
        );

        const firstTarball = await service.getTarball('https://registry.npmjs.org/left-pad/-/left-pad-1.0.0.tgz');
        const secondTarball = await service.getTarball('https://registry.npmjs.org/left-pad/-/left-pad-1.0.0.tgz');

        assert.strictEqual(firstTarball!.content.toString(), 'cached package');
        assert.strictEqual(secondTarball!.content.toString(), 'cached package');
        assert.strictEqual(registryClient.tarballFetchCount, 1);
    });
});
