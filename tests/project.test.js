'use strict';

const {Project} = require('../project')
const assert = require("assert");

describe('Project', function () {
    it('test1', async function () {
        const p = new Project();

        p.addLockVersion('jquery', '3.0.0');
        p.lockDate = new Date("2020-01-01T00:00:00.000Z")

        const jqPkg = await p.getPackage('jquery')
        const msPkg = await p.getPackage('ms');

        assert.equal(jqPkg['dist-tags']['latest'], '3.0.0');
        assert.equal(msPkg['dist-tags']['latest'], '2.1.2');
    })
});