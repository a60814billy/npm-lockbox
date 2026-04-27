import {PackageData} from "../domain/packageMetadata";
import {Project} from "../domain/project";

export interface PackageMetadataRepository {
    findByName(packageName: string): Promise<PackageData | null>;
    save(packageMetadata: PackageData): Promise<void>;
}

export interface PackageRegistryClient {
    fetchPackage(packageName: string): Promise<PackageData | null>;
    fetchTarball(tarballUrl: string): Promise<TarballData | null>;
}

export interface ProjectRepository {
    createProject(project: Project): Promise<void>;
    findProjectByName(projectName: string): Promise<Project | null>;
    saveProject(project: Project): Promise<void>;
}

export interface TarballData {
    content: Buffer;
    contentType: string;
}

export interface TarballCache {
    findByUrl(tarballUrl: string): Promise<TarballData | null>;
    save(tarballUrl: string, tarball: TarballData): Promise<void>;
}
