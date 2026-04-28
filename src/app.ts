import http from "http";
import fs from "fs";
import path from "path";
import {URL} from "url";
import express, {Express, NextFunction, Request, Response} from "express";
import {PackageCatalogService} from "./application/packageCatalogService";
import {ProjectService} from "./application/projectService";
import {TarballCacheService} from "./application/tarballCacheService";
import {NpmPackageRegistryClient} from "./infrastructure/npm/npmPackageRegistryClient";
import {SqlitePackageMetadataRepository} from "./infrastructure/sqlite/sqlitePackageMetadataRepository";
import {FileSystemTarballCache} from "./infrastructure/filesystem/fileSystemTarballCache";
import {PackageData} from "./domain/packageMetadata";
import {PackageRegistryClient, TarballCache} from "./application/ports";


export class Application {
    private app: Express
    private server?: http.Server;
    private packageMetadataRepository: SqlitePackageMetadataRepository;
    private packageCatalogService: PackageCatalogService;
    private projectService: ProjectService;
    private tarballCacheService: TarballCacheService;
    private frontendRegistered = false;
    private errorHandlerRegistered = false;
    private frontendDevServer?: {close: () => Promise<void>};

    constructor(
        dbPath?: string,
        tarballCacheDir?: string,
        packageRegistryClient: PackageRegistryClient = new NpmPackageRegistryClient(),
        tarballCache: TarballCache = new FileSystemTarballCache(tarballCacheDir),
    ) {
        this.packageMetadataRepository = new SqlitePackageMetadataRepository(dbPath);
        this.packageCatalogService = new PackageCatalogService(
            this.packageMetadataRepository,
            packageRegistryClient,
        );
        this.projectService = new ProjectService(this.packageMetadataRepository);
        this.tarballCacheService = new TarballCacheService(
            tarballCache,
            packageRegistryClient,
        );

        this.app = express();
        this.app.use(express.json());

        this.registerProjectRoutes();
        this.registerRegistryRoutes();
        this.registerApiFallbackRoutes();
    }

    private registerProjectRoutes() {
        this.app.get('/projects', this.asyncRoute(async (_req, res) => {
            const projects = await this.projectService.listProjects();
            res.json(projects.map((project) => project.toSnapshot()));
        }));

        this.app.post('/projects', this.asyncRoute(async (req, res) => {
            const lockDate = req.body.lockDate === undefined
                ? Date.now()
                : this.parseLockDate(req.body.lockDate);

            try {
                const project = await this.projectService.createProject(req.body.name, lockDate);
                res.status(201).json(project.toSnapshot());
            } catch (error) {
                this.sendProjectError(res, error);
            }
        }));

        this.app.get('/projects/:projectName', this.asyncRoute(async (req, res) => {
            const projectName = this.routeParam(req.params.projectName);
            try {
                const project = await this.projectService.getProject(projectName);
                if (!project) {
                    res.status(404).json({error: `project ${projectName} not found`});
                    return;
                }

                res.json(project.toSnapshot());
            } catch (error) {
                this.sendProjectError(res, error);
            }
        }));

        this.app.delete('/projects/:projectName', this.asyncRoute(async (req, res) => {
            const projectName = this.routeParam(req.params.projectName);
            try {
                const deleted = await this.projectService.deleteProject(projectName);
                if (!deleted) {
                    res.status(404).json({error: `project ${projectName} not found`});
                    return;
                }

                res.status(204).end();
            } catch (error) {
                this.sendProjectError(res, error);
            }
        }));

        this.app.put('/projects/:projectName/lock-date', this.asyncRoute(async (req, res) => {
            const projectName = this.routeParam(req.params.projectName);
            try {
                const project = await this.projectService.setLockDate(
                    projectName,
                    this.parseLockDate(req.body.lockDate),
                );
                if (!project) {
                    res.status(404).json({error: `project ${projectName} not found`});
                    return;
                }

                res.json(project.toSnapshot());
            } catch (error) {
                this.sendProjectError(res, error);
            }
        }));

        this.app.delete('/projects/:projectName/lock-date', this.asyncRoute(async (req, res) => {
            const projectName = this.routeParam(req.params.projectName);
            try {
                const project = await this.projectService.clearLockDate(projectName);
                if (!project) {
                    res.status(404).json({error: `project ${projectName} not found`});
                    return;
                }

                res.json(project.toSnapshot());
            } catch (error) {
                this.sendProjectError(res, error);
            }
        }));

        this.app.put(/^\/projects\/([^/]+)\/packages\/(.+)\/max-version$/, this.asyncRoute(async (req, res) => {
            const projectName = this.routeParam(req.params[0]);
            try {
                const project = await this.projectService.setPackageMaxVersion(
                    projectName,
                    this.parsePackageNameFromWildcard(this.routeParam(req.params[1])),
                    req.body.maxVersion,
                );
                if (!project) {
                    res.status(404).json({error: `project ${projectName} not found`});
                    return;
                }

                res.json(project.toSnapshot());
            } catch (error) {
                this.sendProjectError(res, error);
            }
        }));

        this.app.delete(/^\/projects\/([^/]+)\/packages\/(.+)\/max-version$/, this.asyncRoute(async (req, res) => {
            const projectName = this.routeParam(req.params[0]);
            try {
                const project = await this.projectService.removePackageMaxVersion(
                    projectName,
                    this.parsePackageNameFromWildcard(this.routeParam(req.params[1])),
                );
                if (!project) {
                    res.status(404).json({error: `project ${projectName} not found`});
                    return;
                }

                res.json(project.toSnapshot());
            } catch (error) {
                this.sendProjectError(res, error);
            }
        }));
    }

    private registerRegistryRoutes() {
        this.app.get('/p/:projectName', (req, res) => {
            res.status(200).send(`Registry project ${this.routeParam(req.params.projectName)}`);
        });

        this.app.get('/p/:projectName/-/tarballs', this.asyncRoute(async (req, res) => {
            const tarballUrl = typeof req.query.url === 'string' ? req.query.url : '';
            if (!tarballUrl) {
                res.status(400).json({error: 'url query parameter is required'});
                return;
            }
            if (!this.isAllowedTarballUrl(tarballUrl)) {
                res.status(400).json({error: 'tarball url must be an https://registry.npmjs.org/ URL'});
                return;
            }

            try {
                const tarball = await this.tarballCacheService.getTarball(tarballUrl);
                if (!tarball) {
                    res.status(404).json({error: `tarball ${tarballUrl} not found`});
                    return;
                }

                res.setHeader('content-type', tarball.contentType);
                res.send(tarball.content);
            } catch (error) {
                this.sendUpstreamError(res, error);
            }
        }));

        this.app.get(/^\/p\/([^/]+)\/(.+)\/-\/([^/]+\.tgz)$/, this.asyncRoute(async (req, res) => {
            const packageName = this.parsePackageNameFromWildcard(this.routeParam(req.params[1]));
            const tarballFile = this.parsePackageNameFromWildcard(this.routeParam(req.params[2]));
            if (!packageName || !tarballFile) {
                res.status(400).json({error: 'tarball path is required'});
                return;
            }

            await this.sendTarball(
                res,
                this.buildRegistryTarballUrl(packageName, tarballFile),
            );
        }));

        this.app.get(/^\/p\/([^/]+)\/(.+)$/, this.asyncRoute(async (req, res) => {
            const projectName = this.routeParam(req.params[0]);
            const project = await this.projectService.getProject(projectName);
            if (!project) {
                res.status(404).json({error: `project ${projectName} not found`});
                return;
            }

            const pkgName = this.parsePackageNameFromWildcard(this.routeParam(req.params[1]));
            console.log(pkgName);
            if (!pkgName) {
                res.status(400).json({error: 'package name is required'});
                return;
            }

            try {
                const pkg = await this.packageCatalogService.getPackage(project, pkgName)
                if (pkg) {
                    res.json(this.rewriteTarballUrls(req, projectName, pkg));
                    return;
                }

                res.status(404).send(`package ${pkgName} Not Found!`);
            } catch (error) {
                this.sendUpstreamError(res, error);
            }
        }));
    }

    parsePkgNameFromReq(req: Request) {
        let pkgName = decodeURIComponent(req.url);
        if (pkgName.endsWith('/')) {
            pkgName = pkgName.substring(0, pkgName.length - 1);
        }
        if (pkgName.startsWith('/')) {
            pkgName = pkgName.substring(1);
        }
        return pkgName;
    }

    getExpressApp() {
        return this.app;
    }

    async prepare() {
        await this.registerFrontendRoutes();
        this.registerErrorHandler();
    }

    async start() {
        const port = Number(process.env.PORT || 8080);
        await this.prepare();
        await new Promise<void>((resolve) => {
            this.server = this.app.listen(port, () => {
                console.log(`Server started at port ${port}`);
                resolve();
            });
        });
    }

    close() {
        if (this.server) {
            this.server.close();
        }
        if (this.frontendDevServer) {
            this.frontendDevServer.close().catch((error) => console.error(error));
        }
        this.packageMetadataRepository.close();
    }

    private registerApiFallbackRoutes() {
        this.app.use(['/projects', '/p'], (req, res) => {
            res.status(404).json({error: `${req.originalUrl} not found`});
        });
    }

    private async registerFrontendRoutes() {
        if (this.frontendRegistered) {
            return;
        }
        this.frontendRegistered = true;

        const frontendRoot = path.resolve(process.cwd(), 'frontend');
        const frontendDist = path.join(frontendRoot, 'dist');
        const isProduction = process.env.NODE_ENV === 'production';

        if (!isProduction) {
            const vite = await this.importVite();
            const viteServer = await vite.createServer({
                root: frontendRoot,
                appType: 'custom',
                configFile: path.join(frontendRoot, 'vite.config.mjs'),
                server: {
                    middlewareMode: true,
                },
            });
            this.frontendDevServer = viteServer;

            this.app.use(viteServer.middlewares);
            this.app.use(/.*/, this.asyncRoute(async (req, res) => {
                const indexPath = path.join(frontendRoot, 'index.html');
                const template = fs.readFileSync(indexPath, 'utf-8');
                const html = await viteServer.transformIndexHtml(req.originalUrl, template);
                res.status(200).setHeader('content-type', 'text/html').end(html);
            }));
            return;
        }

        this.app.use(express.static(frontendDist));
        this.app.get(/.*/, (req, res) => {
            res.sendFile(path.join(frontendDist, 'index.html'));
        });
    }

    private async importVite() {
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        return dynamicImport('vite') as Promise<typeof import('vite')>;
    }

    private registerErrorHandler() {
        if (this.errorHandlerRegistered) {
            return;
        }
        this.errorHandlerRegistered = true;

        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            console.error(err);
            res.status(500).json({error: err.message});
        });
    }

    private parsePackageNameFromWildcard(wildcardPath: string) {
        let packageName = decodeURIComponent(wildcardPath || '');
        if (packageName.endsWith('/')) {
            packageName = packageName.substring(0, packageName.length - 1);
        }
        if (packageName.startsWith('/')) {
            packageName = packageName.substring(1);
        }
        return packageName;
    }

    private routeParam(param: string | string[] | undefined) {
        if (Array.isArray(param)) {
            return param.join('/');
        }

        return param || '';
    }

    private parseLockDate(lockDate: unknown) {
        if (typeof lockDate === 'number') {
            return lockDate;
        }

        if (typeof lockDate === 'string') {
            const numericLockDate = Number(lockDate);
            if (Number.isFinite(numericLockDate)) {
                return numericLockDate;
            }

            const parsedDate = new Date(lockDate).valueOf();
            if (Number.isFinite(parsedDate)) {
                return parsedDate;
            }
        }

        throw new Error("lockDate must be an ISO date string or timestamp");
    }

    private rewriteTarballUrls(req: Request, projectName: string, pkg: PackageData): PackageData {
        const versions = Object.keys(pkg.versions).reduce((acc: PackageData['versions'], version) => {
            const packageVersion = pkg.versions[version];
            const tarballUrl = packageVersion.dist?.tarball;

            acc[version] = tarballUrl ? {
                ...packageVersion,
                dist: {
                    ...packageVersion.dist,
                    tarball: this.rewriteTarballUrl(req, projectName, packageVersion.name, tarballUrl),
                },
            } : packageVersion;

            return acc;
        }, {});

        return {
            ...pkg,
            versions,
        };
    }

    private rewriteTarballUrl(req: Request, projectName: string, packageName: string, tarballUrl: string) {
        try {
            const tarballPath = new URL(tarballUrl).pathname;
            const tarballFile = tarballPath.substring(tarballPath.lastIndexOf('/') + 1);
            const tarballPackageName = this.parsePackageNameFromTarballPath(tarballPath) || packageName;
            if (tarballFile) {
                return `${req.protocol}://${req.get('host')}/p/${encodeURIComponent(projectName)}/${this.encodePath(tarballPackageName)}/-/${encodeURIComponent(tarballFile)}`;
            }
        } catch (error) {
            // Fall back to the query-based route below for unusual upstream metadata.
        }

        const baseUrl = `${req.protocol}://${req.get('host')}/p/${encodeURIComponent(projectName)}/-/tarballs`;
        return `${baseUrl}?url=${encodeURIComponent(tarballUrl)}`;
    }

    private parsePackageNameFromTarballPath(tarballPath: string) {
        const pathSegments = tarballPath
            .split('/')
            .filter((segment) => segment.length > 0);
        const tarballSeparatorIndex = pathSegments.indexOf('-');
        if (tarballSeparatorIndex <= 0) {
            return '';
        }

        return pathSegments
            .slice(0, tarballSeparatorIndex)
            .map(decodeURIComponent)
            .join('/');
    }

    private buildRegistryTarballUrl(packageName: string, tarballFile: string) {
        return `https://registry.npmjs.org/${this.encodePath(packageName)}/-/${encodeURIComponent(tarballFile)}`;
    }

    private encodePath(pathValue: string) {
        return pathValue.split('/').map(encodeURIComponent).join('/');
    }

    private isAllowedTarballUrl(tarballUrl: string) {
        try {
            const url = new URL(tarballUrl);
            return url.protocol === 'https:' && url.hostname === 'registry.npmjs.org';
        } catch (error) {
            return false;
        }
    }

    private async sendTarball(res: Response, tarballUrl: string) {
        if (!this.isAllowedTarballUrl(tarballUrl)) {
            res.status(400).json({error: 'tarball url must be an https://registry.npmjs.org/ URL'});
            return;
        }

        try {
            const tarball = await this.tarballCacheService.getTarball(tarballUrl);
            if (!tarball) {
                res.status(404).json({error: `tarball ${tarballUrl} not found`});
                return;
            }

            res.setHeader('content-type', tarball.contentType);
            res.send(tarball.content);
        } catch (error) {
            this.sendUpstreamError(res, error);
        }
    }

    private asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
        return (req: Request, res: Response, next: NextFunction) => {
            handler(req, res, next).catch(next);
        };
    }

    private sendProjectError(res: Response, error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes('already exists') ? 409 : 400;
        res.status(status).json({error: message});
    }

    private sendUpstreamError(res: Response, error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(error);
        res.status(502).json({error: message});
    }
}
