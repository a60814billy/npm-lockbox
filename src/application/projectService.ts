import semver from "semver";
import {Project} from "../domain/project";
import {ProjectRepository} from "./ports";

const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export class ProjectService {
    constructor(private readonly projectRepository: ProjectRepository) {
    }

    async createProject(projectName: string, lockDate = Date.now()): Promise<Project> {
        this.assertValidProjectName(projectName);
        this.assertValidLockDate(lockDate);

        const project = new Project({
            projectName,
            lockDate,
            lockVersionList: {},
        });

        await this.projectRepository.createProject(project);
        return project;
    }

    async getProject(projectName: string): Promise<Project | null> {
        this.assertValidProjectName(projectName);
        return this.projectRepository.findProjectByName(projectName);
    }

    async listProjects(): Promise<Project[]> {
        return this.projectRepository.listProjects();
    }

    async setLockDate(projectName: string, lockDate: number): Promise<Project | null> {
        this.assertValidProjectName(projectName);
        this.assertValidLockDate(lockDate);

        const project = await this.projectRepository.findProjectByName(projectName);
        if (!project) {
            return null;
        }

        project.lockDate = lockDate;
        await this.projectRepository.saveProject(project);

        return project;
    }

    async clearLockDate(projectName: string): Promise<Project | null> {
        this.assertValidProjectName(projectName);

        const project = await this.projectRepository.findProjectByName(projectName);
        if (!project) {
            return null;
        }

        project.lockDate = null;
        await this.projectRepository.saveProject(project);

        return project;
    }

    async setPackageMaxVersion(projectName: string, packageName: string, maxVersion: string): Promise<Project | null> {
        this.assertValidProjectName(projectName);
        if (!packageName) {
            throw new Error("Package name is required");
        }
        if (!semver.valid(maxVersion)) {
            throw new Error("maxVersion must be a valid semver version");
        }

        const project = await this.projectRepository.findProjectByName(projectName);
        if (!project) {
            return null;
        }

        project.addLockVersion(packageName, maxVersion);
        await this.projectRepository.saveProject(project);

        return project;
    }

    async removePackageMaxVersion(projectName: string, packageName: string): Promise<Project | null> {
        this.assertValidProjectName(projectName);
        if (!packageName) {
            throw new Error("Package name is required");
        }

        const project = await this.projectRepository.findProjectByName(projectName);
        if (!project) {
            return null;
        }

        project.removeLockVersion(packageName);
        await this.projectRepository.saveProject(project);

        return project;
    }

    async deleteProject(projectName: string): Promise<boolean> {
        this.assertValidProjectName(projectName);
        return this.projectRepository.deleteProject(projectName);
    }

    private assertValidProjectName(projectName: string) {
        if (!projectName || !PROJECT_NAME_PATTERN.test(projectName)) {
            throw new Error("Project name must contain only letters, numbers, dots, underscores, and dashes");
        }
    }

    private assertValidLockDate(lockDate: number) {
        if (!Number.isFinite(lockDate) || lockDate < 0) {
            throw new Error("lockDate must be a valid timestamp");
        }
    }
}
