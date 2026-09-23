import { assertServiceReachable } from './test-setup';

beforeAll(async () => {
  await assertServiceReachable();
});
