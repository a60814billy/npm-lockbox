export interface PackageData {
    name: string;
    description?: string;
    time: Record<string, string>;
    versions: Record<string, PackageVersion>;
    'dist-tags'?: Record<string, string>;
    [key: string]: unknown;
}

export interface PackageVersion {
    name: string;
    title?: string;
    description?: string;
    version: string;
    dist?: {
        tarball?: string;
        [key: string]: unknown;
    };
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
}
