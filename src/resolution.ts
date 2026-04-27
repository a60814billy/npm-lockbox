import {resolveMinimalVersion} from './package';
import semver from "semver";
import {Project} from "./domain/project";
import {PackageCatalogService} from "./application/packageCatalogService";

interface ResolvePackage {
    name: string;
    requiredVersion: string;
    supportedVersions: string[];
    versionReleaseDate: Record<string, number>;

    resolveToVersion?: string;
    resolveToVersionReleaseDate?: number;
    historyRequiredVersion?: string[];
}

interface Dep {
    name: string;
    requiredVersion: string;
}

class PackageResolver {

    private packageMap: Map<string, ResolvePackage> = new Map<string, ResolvePackage>();
    private readonly project: Project;
    private readonly packageCatalogService: PackageCatalogService;

    private deps: Dep[] = [];

    constructor(project: Project, packageCatalogService: PackageCatalogService) {
        this.project = project;
        this.packageCatalogService = packageCatalogService;
    }

    addPackage(name: string, requiredVersion: string) {
        this.deps.push({
            name: name,
            requiredVersion: requiredVersion,
        });
    }

    async resolve() {
        while (this.deps.length > 0) {
            const firstPkg = this.deps[0];
            this.deps.shift();

            if (this.packageMap.has(firstPkg.name)) {
                const prevPkg = this.packageMap.get(firstPkg.name)!;
                if (!semver.satisfies(prevPkg.resolveToVersion!, firstPkg.requiredVersion)) {
                    if (semver.gte(semver.minVersion(firstPkg.requiredVersion)!, prevPkg.resolveToVersion!)) {
                        // try to upgrade
                        const newResolveVersion = resolveMinimalVersion(prevPkg.supportedVersions, firstPkg.requiredVersion);
                        if (newResolveVersion) {
                            if (!prevPkg.historyRequiredVersion?.every((v) => {
                                return semver.satisfies(newResolveVersion, v);
                            })) {
                                console.error(`conflict ${firstPkg.name} ${newResolveVersion} ${prevPkg.historyRequiredVersion}`);
                            } else {
                                prevPkg.resolveToVersion = newResolveVersion;
                                prevPkg.resolveToVersionReleaseDate = prevPkg.versionReleaseDate[newResolveVersion];
                                prevPkg.historyRequiredVersion?.push(firstPkg.requiredVersion);
                            }
                        }
                    }
                } else {
                    prevPkg.historyRequiredVersion?.push(firstPkg.requiredVersion);
                }
            } else {
                const pkg = await this.packageCatalogService.getPackage(this.project, firstPkg.name);
                if (pkg) {
                    const r: ResolvePackage = {
                        name: pkg.name,
                        requiredVersion: firstPkg.requiredVersion,
                        supportedVersions: Object.keys(pkg.versions),
                        historyRequiredVersion: [firstPkg.requiredVersion],
                        versionReleaseDate: Object.keys(pkg.time).reduce((acc: Record<string, number>, cur) => {
                            acc[cur] = new Date(pkg.time[cur]).valueOf();
                            return acc;
                        }, {}),
                    };
                    this.packageMap.set(pkg.name, r);
                    r.resolveToVersion = resolveMinimalVersion(r.supportedVersions, firstPkg.requiredVersion);
                    r.resolveToVersionReleaseDate = new Date(pkg.time[r.resolveToVersion!]).valueOf();

                    if (pkg.versions[r.resolveToVersion!].dependencies!) {
                        Object.keys(pkg.versions[r.resolveToVersion!].dependencies!).forEach((dep) => {
                            this.deps.push({
                                name: dep,
                                requiredVersion: pkg.versions[r.resolveToVersion!].dependencies![dep],
                            });
                        });
                    }
                }
            }
        }

        console.log('-------------------------------------------');
        let dateArray: number[] = [];
        this.packageMap = new Map([...this.packageMap.entries()].sort((a, b) => {
            return a[0].localeCompare(b[0]);
        }));
        for (let pkgName of this.packageMap.keys()) {
            const pkg = this.packageMap.get(pkgName)!;
            // console.log(`${pkg.name}: ${pkg.resolveToVersion}`);
            console.log(`project.addLockVersion('${pkg.name}', '${pkg.resolveToVersion}');`);
            dateArray.push(pkg.resolveToVersionReleaseDate!);
        }
        dateArray.sort((a, b) => a - b);
        console.log('------');
        console.log('Set date to:');
        console.log(new Date(dateArray[dateArray.length - 1]).toISOString());
    }
}

