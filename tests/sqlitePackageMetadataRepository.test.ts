import assert from "assert";
import {SqlitePackageMetadataRepository} from "@/infrastructure/sqlite/sqlitePackageMetadataRepository";
import {PackageData} from "@/domain/packageMetadata";
import {Project} from "@/project";

function createPackageData(): PackageData {
    return {
        name: 'left-pad',
        description: 'left-pad package',
        time: {
            created: '2018-01-01T00:00:00.000Z',
            modified: '2018-01-01T00:00:00.000Z',
            '1.0.0': '2018-01-01T00:00:00.000Z',
        },
        versions: {
            '1.0.0': {
                name: 'left-pad',
                version: '1.0.0',
            },
        },
    };
}

describe('SqlitePackageMetadataRepository', function () {
    it('should store and load package metadata', async function () {
        const repository = new SqlitePackageMetadataRepository(':memory:');

        await repository.save(createPackageData());
        const pkg = await repository.findByName('left-pad');
        const missingPkg = await repository.findByName('missing');

        assert.strictEqual(pkg!.name, 'left-pad');
        assert.strictEqual(pkg!.versions['1.0.0'].version, '1.0.0');
        assert.strictEqual(missingPkg, null);

        repository.close();
    });

    it('should store and load project rules', async function () {
        const repository = new SqlitePackageMetadataRepository(':memory:');
        const project = new Project({
            projectName: 'legacy-app',
            lockDate: new Date('2020-01-01T00:00:00.000Z').valueOf(),
            lockVersionList: {},
        });
        project.addLockVersion('express', '4.0.0');

        await repository.createProject(project);
        const loadedProject = await repository.findProjectByName('legacy-app');

        assert.strictEqual(loadedProject!.projectName, 'legacy-app');
        assert.strictEqual(loadedProject!.lockDate, new Date('2020-01-01T00:00:00.000Z').valueOf());
        assert.strictEqual(loadedProject!.lockVersionList.express, '4.0.0');

        repository.close();
    });
});
