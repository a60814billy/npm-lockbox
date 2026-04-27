'use strict';

import {Project, PackageData} from "@/project";
import {strictEqual} from "assert";

function createPackageData(name: string, releases: { version: string, time: string }[]): PackageData {
    const time: Record<string, string> = {
        created: releases[0].time,
        modified: releases[releases.length - 1].time,
    };
    const versions = releases.reduce((acc: PackageData['versions'], release) => {
        time[release.version] = release.time;
        acc[release.version] = {
            name,
            version: release.version,
            description: `${name} ${release.version}`,
        };
        return acc;
    }, {});

    return {
        name,
        description: `${name} package`,
        time,
        versions,
    };
}

describe('Project', function () {
    it('should limit package metadata by maximum version', function () {
        const p = new Project();
        p.addLockVersion('jquery', '3.0.0');

        const jqPkg = p.limitPackage(createPackageData('jquery', [
            {version: '2.0.0', time: '2018-01-01T00:00:00.000Z'},
            {version: '3.0.0', time: '2019-01-01T00:00:00.000Z'},
            {version: '4.0.0', time: '2021-01-01T00:00:00.000Z'},
        ]));

        strictEqual(jqPkg['dist-tags']!.latest, '3.0.0');
        strictEqual(jqPkg.versions['4.0.0'], undefined);
    });

    it('should limit package metadata by lock date', function () {
        const p = new Project();
        p.lockDate = new Date("2020-01-01T00:00:00.000Z").valueOf();

        const msPkg = p.limitPackage(createPackageData('ms', [
            {version: '2.1.1', time: '2018-01-01T00:00:00.000Z'},
            {version: '2.1.2', time: '2019-01-01T00:00:00.000Z'},
            {version: '2.1.3', time: '2021-01-01T00:00:00.000Z'},
        ]));

        strictEqual(msPkg['dist-tags']!.latest, '2.1.2');
        strictEqual(msPkg.versions['2.1.3'], undefined);
    });

    it('should apply lock date and maximum version together', function () {
        const p = new Project();
        p.lockDate = new Date("2020-01-01T00:00:00.000Z").valueOf();
        p.addLockVersion('express', '4.0.0');

        const expressPkg = p.limitPackage(createPackageData('express', [
            {version: '3.21.2', time: '2019-01-01T00:00:00.000Z'},
            {version: '4.0.0', time: '2021-01-01T00:00:00.000Z'},
        ]));

        strictEqual(expressPkg['dist-tags']!.latest, '3.21.2');
        strictEqual(expressPkg.versions['4.0.0'], undefined);
    });

    it('should set latest to the highest allowed semver version', function () {
        const p = new Project();
        p.lockDate = new Date("2022-01-01T00:00:00.000Z").valueOf();

        const pkg = p.limitPackage(createPackageData('example', [
            {version: '1.0.0', time: '2021-01-01T00:00:00.000Z'},
            {version: '2.0.0', time: '2020-01-01T00:00:00.000Z'},
        ]));

        strictEqual(pkg['dist-tags']!.latest, '2.0.0');
    });

    it('should ignore some package version', function () {
        const p = new Project();
        p.addLockVersion('lodash._stack', '4.0.2');
        p.addIgnoreVersion('lodash._stack', '4.0.0');

        const lodashStack = p.limitPackage(createPackageData('lodash._stack', [
            {version: '4.0.0', time: '2016-01-01T00:00:00.000Z'},
            {version: '4.0.1', time: '2016-02-01T00:00:00.000Z'},
            {version: '4.0.2', time: '2016-03-01T00:00:00.000Z'},
        ]));

        strictEqual(Object.keys(lodashStack.time).includes('4.0.0'), false);
    });
});
