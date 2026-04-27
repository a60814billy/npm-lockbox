import crypto from "crypto";
import fs from "fs";
import path from "path";
import {TarballCache, TarballData} from "../../application/ports";

interface TarballCacheMetadata {
    url: string;
    contentType: string;
}

export class FileSystemTarballCache implements TarballCache {
    constructor(private readonly cacheDir = process.env.NPM_LB_TARBALL_CACHE_DIR || path.join(process.cwd(), 'mirror')) {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, {recursive: true});
        }
    }

    async findByUrl(tarballUrl: string): Promise<TarballData | null> {
        const cachePaths = this.getCachePaths(tarballUrl);
        if (!fs.existsSync(cachePaths.contentPath) || !fs.existsSync(cachePaths.metadataPath)) {
            return null;
        }

        const metadata = JSON.parse(fs.readFileSync(cachePaths.metadataPath, 'utf8')) as TarballCacheMetadata;

        return {
            content: fs.readFileSync(cachePaths.contentPath),
            contentType: metadata.contentType,
        };
    }

    async save(tarballUrl: string, tarball: TarballData): Promise<void> {
        const cachePaths = this.getCachePaths(tarballUrl);
        fs.writeFileSync(cachePaths.contentPath, tarball.content);
        fs.writeFileSync(cachePaths.metadataPath, JSON.stringify({
            url: tarballUrl,
            contentType: tarball.contentType,
        }));
    }

    private getCachePaths(tarballUrl: string) {
        const cacheKey = crypto.createHash('sha256').update(tarballUrl).digest('hex');

        return {
            contentPath: path.join(this.cacheDir, `${cacheKey}.tgz`),
            metadataPath: path.join(this.cacheDir, `${cacheKey}.json`),
        };
    }
}
