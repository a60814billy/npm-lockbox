import {Project} from "../domain/project";
import {PackageData} from "../domain/packageMetadata";
import {PackageMetadataRepository, PackageRegistryClient} from "./ports";

export class PackageCatalogService {
    constructor(
        private readonly packageMetadataRepository: PackageMetadataRepository,
        private readonly packageRegistryClient: PackageRegistryClient,
    ) {
    }

    async getPackage(project: Project, packageName: string): Promise<PackageData | null> {
        let pkgMetaData = await this.packageMetadataRepository.findByName(packageName);

        if (!pkgMetaData) {
            pkgMetaData = await this.packageRegistryClient.fetchPackage(packageName);
            if (!pkgMetaData) {
                return null;
            }
            await this.packageMetadataRepository.save(pkgMetaData);
        }

        return project.limitPackage(pkgMetaData);
    }
}
