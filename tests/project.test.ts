'use strict';

import {Project} from "@/project";
import {strictEqual} from "assert";

describe('Project', function () {
    it('test1', async function () {
        const p = new Project();

        p.addLockVersion('jquery', '3.0.0');
        p.lockDate = new Date("2020-01-01T00:00:00.000Z").valueOf();

        const jqPkg = await p.getPackage('jquery')
        const msPkg = await p.getPackage('ms');

        strictEqual(jqPkg['dist-tags']['latest'], '3.0.0');
        strictEqual(msPkg['dist-tags']['latest'], '2.1.2');
    })

    it('should ignore some package version', async function () {
        const p = new Project();

        p.addLockVersion('lodash._stack', '4.0.2');
        p.addIgnoreVersion('lodash._stack', '4.0.0');

        const lodashStack = await p.getPackage('lodash._stack');

        const hasIgnoreVersion = Object.keys(lodashStack.time).some((version) => {
            return version === '4.0.0'
        });

        strictEqual(hasIgnoreVersion, false);
    });
});