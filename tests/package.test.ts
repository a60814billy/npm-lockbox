import {resolveMinimalVersion} from '@/package';
import assert from "assert";

describe('Package', function () {
  it('test1', async function () {
    const version = resolveMinimalVersion(['1.0.0', '2.0.2', '2.0.0', '2.0.1', '3.0.0'], '^2.0.0');

    assert.strictEqual(version, '2.0.0');

  });
});
