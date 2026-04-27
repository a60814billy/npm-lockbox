import {PackageRegistryClient, TarballCache, TarballData} from "./ports";

export class TarballCacheService {
    constructor(
        private readonly tarballCache: TarballCache,
        private readonly packageRegistryClient: PackageRegistryClient,
    ) {
    }

    async getTarball(tarballUrl: string): Promise<TarballData | null> {
        const cachedTarball = await this.tarballCache.findByUrl(tarballUrl);
        if (cachedTarball) {
            return cachedTarball;
        }

        const upstreamTarball = await this.packageRegistryClient.fetchTarball(tarballUrl);
        if (!upstreamTarball) {
            return null;
        }

        await this.tarballCache.save(tarballUrl, upstreamTarball);
        return upstreamTarball;
    }
}
