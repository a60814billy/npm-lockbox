import http from "http";
import https from "https";
import {URL} from "url";
import {PackageData} from "../../domain/packageMetadata";
import {PackageRegistryClient, TarballData} from "../../application/ports";

export class NpmPackageRegistryClient implements PackageRegistryClient {
    constructor(private readonly registryBaseUrl = 'https://registry.npmjs.org/') {
    }

    fetchPackage(packageName: string): Promise<PackageData | null> {
        return new Promise((resolve, reject) => {
            console.log(`Download ${packageName}`);
            const registryUrl = new URL(this.registryBaseUrl);
            const packageUrl = new URL(encodeURIComponent(packageName), registryUrl);
            const client = packageUrl.protocol === 'http:' ? http : https;

            if (packageUrl.protocol !== 'http:' && packageUrl.protocol !== 'https:') {
                reject(new Error(`Unsupported registry URL protocol: ${packageUrl.protocol}`));
                return;
            }

            const req = client.request(packageUrl, {method: 'GET'}, (res) => {
                console.log(`statusCode: ${res.statusCode}`);

                if (res.statusCode === 404) {
                    res.resume();
                    resolve(null);
                    return;
                }

                if (!res.statusCode || res.statusCode >= 400) {
                    res.resume();
                    reject(new Error(`Failed to download ${packageName}: ${res.statusCode}`));
                    return;
                }

                const contentTypeHeader = res.headers['content-type'];
                const contentType = Array.isArray(contentTypeHeader)
                    ? contentTypeHeader[0]
                    : contentTypeHeader || '';

                let data = '';

                res.on('data', (d) => {
                    data += d;
                });

                res.on('end', () => {
                    if (!this.isJsonContentType(contentType)) {
                        reject(new Error(
                            `Failed to download ${packageName}: expected JSON response, got ${contentType || 'unknown content type'}`,
                        ));
                        return;
                    }

                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(
                            `Failed to parse package metadata for ${packageName}: ${e instanceof Error ? e.message : String(e)}`,
                        ));
                    }

                });
            });

            req.on('error', (error) => {
                reject(error);
            });
            req.end();
        });
    }

    private isJsonContentType(contentType: string): boolean {
        const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
        return mediaType === 'application/json' || mediaType.endsWith('+json');
    }

    fetchTarball(tarballUrl: string): Promise<TarballData | null> {
        return new Promise((resolve, reject) => {
            const url = new URL(tarballUrl);
            const client = url.protocol === 'http:' ? http : https;

            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                reject(new Error(`Unsupported tarball URL protocol: ${url.protocol}`));
                return;
            }

            const req = client.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    this.fetchTarball(new URL(res.headers.location, tarballUrl).toString())
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (res.statusCode === 404) {
                    res.resume();
                    resolve(null);
                    return;
                }

                if (!res.statusCode || res.statusCode >= 400) {
                    res.resume();
                    reject(new Error(`Failed to download tarball ${tarballUrl}: ${res.statusCode}`));
                    return;
                }

                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    const contentTypeHeader = res.headers['content-type'];
                    const contentType = Array.isArray(contentTypeHeader)
                        ? contentTypeHeader[0]
                        : contentTypeHeader || 'application/octet-stream';

                    resolve({
                        content: Buffer.concat(chunks),
                        contentType,
                    });
                });
            });

            req.on('error', (error) => {
                reject(error);
            });
        });
    }
}
