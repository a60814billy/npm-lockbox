declare module "node:sqlite" {
    export class DatabaseSync {
        constructor(location: string);
        close(): void;
        exec(sql: string): void;
        prepare(sql: string): StatementSync;
    }

    export class StatementSync {
        get(...anonymousParameters: unknown[]): unknown;
        all(...anonymousParameters: unknown[]): unknown[];
        run(...anonymousParameters: unknown[]): {
            changes: number;
            lastInsertRowid: number | bigint;
        };
    }
}
