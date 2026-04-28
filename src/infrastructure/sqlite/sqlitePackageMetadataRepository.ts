/// <reference path="../../types/node-sqlite.d.ts" />

import fs from "fs";
import path from "path";
import {DatabaseSync} from "node:sqlite";
import {PackageMetadataRepository, ProjectRepository} from "../../application/ports";
import {PackageData} from "../../domain/packageMetadata";
import {Project} from "../../domain/project";

interface PackageMetadataRow {
    metadata_json: string;
}

interface ProjectRow {
    name: string;
    lock_date: number;
    ignore_version_json: string;
}

interface ProjectLimitRow {
    package_name: string;
    max_version: string;
}

const CLEARED_LOCK_DATE = -1;

export class SqlitePackageMetadataRepository implements PackageMetadataRepository, ProjectRepository {
    private readonly db: DatabaseSync;

    constructor(dbPath = process.env.NPM_LB_DB_PATH || path.join(process.cwd(), 'npm-lockbox.sqlite')) {
        if (dbPath !== ':memory:') {
            const dbDir = path.dirname(dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, {recursive: true});
            }
        }

        this.db = new DatabaseSync(dbPath);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS package_metadata (
                name TEXT PRIMARY KEY NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS projects (
                name TEXT PRIMARY KEY NOT NULL,
                lock_date INTEGER NOT NULL,
                ignore_version_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS project_package_limits (
                project_name TEXT NOT NULL,
                package_name TEXT NOT NULL,
                max_version TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_name, package_name),
                FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE CASCADE
            );
        `);
    }

    async findByName(packageName: string): Promise<PackageData | null> {
        const row = this.db
            .prepare('SELECT metadata_json FROM package_metadata WHERE name = ?')
            .get(packageName) as PackageMetadataRow | undefined;

        if (!row) {
            return null;
        }

        return JSON.parse(row.metadata_json);
    }

    async save(packageMetadata: PackageData): Promise<void> {
        this.db
            .prepare(`
                INSERT INTO package_metadata (name, metadata_json)
                VALUES (?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    metadata_json = excluded.metadata_json,
                    updated_at = CURRENT_TIMESTAMP
            `)
            .run(packageMetadata.name, JSON.stringify(packageMetadata));
    }

    async createProject(project: Project): Promise<void> {
        const existingProject = await this.findProjectByName(project.projectName);
        if (existingProject) {
            throw new Error(`Project ${project.projectName} already exists`);
        }

        await this.saveProject(project);
    }

    async findProjectByName(projectName: string): Promise<Project | null> {
        const row = this.db
            .prepare('SELECT name, lock_date, ignore_version_json FROM projects WHERE name = ?')
            .get(projectName) as ProjectRow | undefined;

        if (!row) {
            return null;
        }

        const limitRows = this.db
            .prepare('SELECT package_name, max_version FROM project_package_limits WHERE project_name = ?')
            .all(projectName) as unknown as ProjectLimitRow[];

        return new Project({
            projectName: row.name,
            lockDate: this.toDomainLockDate(row.lock_date),
            lockVersionList: limitRows.reduce((acc: Record<string, string>, limitRow) => {
                acc[limitRow.package_name] = limitRow.max_version;
                return acc;
            }, {}),
            ignoreVersionList: JSON.parse(row.ignore_version_json || '{}'),
        });
    }

    async listProjects(): Promise<Project[]> {
        const projectRows = this.db
            .prepare('SELECT name, lock_date, ignore_version_json FROM projects ORDER BY name COLLATE NOCASE ASC')
            .all() as unknown as ProjectRow[];

        if (projectRows.length === 0) {
            return [];
        }

        const limitRows = this.db
            .prepare('SELECT project_name, package_name, max_version FROM project_package_limits ORDER BY package_name COLLATE NOCASE ASC')
            .all() as unknown as Array<ProjectLimitRow & {project_name: string}>;
        const limitsByProjectName = limitRows.reduce((acc: Record<string, Record<string, string>>, limitRow) => {
            acc[limitRow.project_name] = acc[limitRow.project_name] || {};
            acc[limitRow.project_name][limitRow.package_name] = limitRow.max_version;
            return acc;
        }, {});

        return projectRows.map((row) => new Project({
            projectName: row.name,
            lockDate: this.toDomainLockDate(row.lock_date),
            lockVersionList: limitsByProjectName[row.name] || {},
            ignoreVersionList: JSON.parse(row.ignore_version_json || '{}'),
        }));
    }

    async saveProject(project: Project): Promise<void> {
        this.db
            .prepare(`
                INSERT INTO projects (name, lock_date, ignore_version_json)
                VALUES (?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    lock_date = excluded.lock_date,
                    ignore_version_json = excluded.ignore_version_json,
                    updated_at = CURRENT_TIMESTAMP
            `)
            .run(project.projectName, this.toStoredLockDate(project.lockDate), JSON.stringify(project.ignoreVersionList));

        this.db
            .prepare('DELETE FROM project_package_limits WHERE project_name = ?')
            .run(project.projectName);

        const insertLimitStatement = this.db.prepare(`
            INSERT INTO project_package_limits (project_name, package_name, max_version)
            VALUES (?, ?, ?)
        `);

        Object.keys(project.lockVersionList).forEach((packageName) => {
            insertLimitStatement.run(project.projectName, packageName, project.lockVersionList[packageName]);
        });
    }

    async deleteProject(projectName: string): Promise<boolean> {
        this.db
            .prepare('DELETE FROM project_package_limits WHERE project_name = ?')
            .run(projectName);

        const result = this.db
            .prepare('DELETE FROM projects WHERE name = ?')
            .run(projectName);

        return result.changes > 0;
    }

    private toDomainLockDate(lockDate: number) {
        return lockDate === CLEARED_LOCK_DATE ? null : lockDate;
    }

    private toStoredLockDate(lockDate: number | null) {
        return lockDate === null ? CLEARED_LOCK_DATE : lockDate;
    }

    close() {
        this.db.close();
    }
}
