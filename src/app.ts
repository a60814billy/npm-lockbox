import * as express from "express";
import {Db, MongoClient} from "mongodb";
import {Project} from "./project";

export class Application {
    private client: MongoClient;
    private app: express.Express;
    private db?: Db | null;

    constructor(dbUrl?: string) {
        const url = dbUrl || process.env.NPM_LB_DB_STR || "mongodb://localhost:27017";

        this.client = new MongoClient(url, {
            useUnifiedTopology: true,
        });
        this.db = null;

        this.app = express();

        const project = new Project();
        project.projectName = "default-project";
        project.lockDate = new Date("2017-01-19T00:00:00.000Z").valueOf();
        project.addLockVersion("jquery", "3.0.0");

        this.app.get("*", async (req: express.Request, res: express.Response) => {
            // console.log(fullUrl);

            const pkgName = this.parsePkgNameFromReq(req);

            if (pkgName === "") {
                res.status(200).send(`Home`);
                return;
            }

            const pkg = await project.getPackage(pkgName);
            if (pkg) {
                res.json(pkg);
                return;
            }

            res.status(404).send(`package ${pkgName} Not Found!`);
        });

    }

    public parsePkgNameFromReq(req: express.Request): string {
        let pkgName = decodeURIComponent(req.url);
        if (pkgName.endsWith("/")) {
            pkgName = pkgName.substring(0, pkgName.length - 1);
        }
        if (pkgName.startsWith("/")) {
            pkgName = pkgName.substring(1);
        }
        return pkgName;
    }

    public async start(): Promise<void> {
        const self = this;

        MongoClient.connect("mongodb://localhost:27017", (err, client) => {
            self.db = client.db("npm-lockbox");
            self.app.listen(8080, () => {
                // console.log("Server started at port 8080");
            });
        });
    }
}
