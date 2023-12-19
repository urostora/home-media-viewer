import { getLoginCookie } from './helpers/helper';

describe('__tests__/web/api/helpers getLoginCookie', () => {
  it('bad user specified', async () => {
    const func = async () => await getLoginCookie('se5ye45yry', 'a354yw45y4');

    await expect(func).rejects;
  });
});
