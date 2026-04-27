import assert from "assert";
import {PackageCatalogService} from "@/application/packageCatalogService";
import {PackageMetadataRepository, PackageRegistryClient} from "@/application/ports";
import {PackageData} from "@/domain/packageMetadata";
import {Project} from "@/project";

class InMemoryPackageMetadataRepository implements PackageMetadataRepository {
    private packages = new Map<string, PackageData>();

    async findByName(packageName: string): Promise<PackageData | null> {
        return this.packages.get(packageName) || null;
    }

    async save(packageMetadata: PackageData): Promise<void> {
        this.packages.set(packageMetadata.name, packageMetadata);
    }
}

class StubPackageRegistryClient implements PackageRegistryClient {
    public fetchCount = 0;

    constructor(private readonly packageMetadata: PackageData) {
    }

    async fetchPackage(packageName: string): Promise<PackageData | null> {
        this.fetchCount += 1;
        if (packageName !== this.packageMetadata.name) {
            return null;
        }
        return this.packageMetadata;
    }

    async fetchTarball(_tarballUrl: string): Promise<null> {
        return null;
    }
}

function createPackageData(): PackageData {
    return {
        name: 'left-pad',
        description: 'left-pad package',
        time: {
            created: '2018-01-01T00:00:00.000Z',
            modified: '2021-01-01T00:00:00.000Z',
            '1.0.0': '2018-01-01T00:00:00.000Z',
            '1.1.0': '2021-01-01T00:00:00.000Z',
        },
        versions: {
            '1.0.0': {
                name: 'left-pad',
                version: '1.0.0',
            },
            '1.1.0': {
                name: 'left-pad',
                version: '1.1.0',
            },
        },
    };
}

describe('PackageCatalogService', function () {
    it('should fetch, cache, and apply project rules without exposing persistence to the domain', async function () {
        const repository = new InMemoryPackageMetadataRepository();
        const registryClient = new StubPackageRegistryClient(createPackageData());
        const service = new PackageCatalogService(repository, registryClient);
        const project = new Project();
        project.lockDate = new Date('2020-01-01T00:00:00.000Z').valueOf();

        const pkg = await service.getPackage(project, 'left-pad');
        const cachedPkg = await service.getPackage(project, 'left-pad');

        assert.strictEqual(pkg!['dist-tags']!.latest, '1.0.0');
        assert.strictEqual(cachedPkg!['dist-tags']!.latest, '1.0.0');
        assert.strictEqual(registryClient.fetchCount, 1);
    });
});
