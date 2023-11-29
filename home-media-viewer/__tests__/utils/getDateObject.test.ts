import { getDateObject } from '@/utils/utils';

describe('utils/utils', () => {
  it('getDateObject with 8 digit', () => {
    const dateString = '20230831';

    const result = getDateObject(dateString);

    expect(result).toBeInstanceOf(Date);

    expect(result?.getFullYear()).toBe(2023);
    expect(result?.getMonth()).toBe(7);
    expect(result?.getDate()).toBe(31);
    expect(result?.getHours()).toBe(0);
    expect(result?.getMinutes()).toBe(0);
    expect(result?.getSeconds()).toBe(0);
    expect(result?.getMilliseconds()).toBe(0);
  });

  it('getDateObject with 8 digit separated by -', () => {
    const dateString = '2023-08-31';

    const result = getDateObject(dateString);

    expect(result).toBeInstanceOf(Date);

    expect(result?.getFullYear()).toBe(2023);
    expect(result?.getMonth()).toBe(7);
    expect(result?.getDate()).toBe(31);
    expect(result?.getHours()).toBe(0);
    expect(result?.getMinutes()).toBe(0);
    expect(result?.getSeconds()).toBe(0);
    expect(result?.getMilliseconds()).toBe(0);
  });

  it('getDateObject with 8 digit separated by .', () => {
    const dateString = '2023.08.31';

    const result = getDateObject(dateString);

    expect(result).toBeInstanceOf(Date);

    expect(result?.getFullYear()).toBe(2023);
    expect(result?.getMonth()).toBe(7);
    expect(result?.getDate()).toBe(31);
    expect(result?.getHours()).toBe(0);
    expect(result?.getMinutes()).toBe(0);
    expect(result?.getSeconds()).toBe(0);
    expect(result?.getMilliseconds()).toBe(0);
  });

  it('getDateObject with 10 digit', () => {
    const dateString = '2023083111';

    const result = getDateObject(dateString);

    expect(result).toBeInstanceOf(Date);

    expect(result?.getFullYear()).toBe(2023);
    expect(result?.getMonth()).toBe(7);
    expect(result?.getDate()).toBe(31);
    expect(result?.getHours()).toBe(11);
    expect(result?.getMinutes()).toBe(0);
    expect(result?.getSeconds()).toBe(0);
    expect(result?.getMilliseconds()).toBe(0);
  });

  it('getDateObject with 12 digit', () => {
    const dateString = '202308311122';

    const result = getDateObject(dateString);

    expect(result).toBeInstanceOf(Date);

    expect(result?.getFullYear()).toBe(2023);
    expect(result?.getMonth()).toBe(7);
    expect(result?.getDate()).toBe(31);
    expect(result?.getHours()).toBe(11);
    expect(result?.getMinutes()).toBe(22);
    expect(result?.getSeconds()).toBe(0);
    expect(result?.getMilliseconds()).toBe(0);
  });

  it('getDateObject with 14 digit', () => {
    const dateString = '20230831112233';

    const result = getDateObject(dateString);

    expect(result).toBeInstanceOf(Date);

    expect(result?.getFullYear()).toBe(2023);
    expect(result?.getMonth()).toBe(7);
    expect(result?.getDate()).toBe(31);
    expect(result?.getHours()).toBe(11);
    expect(result?.getMinutes()).toBe(22);
    expect(result?.getSeconds()).toBe(33);
    expect(result?.getMilliseconds()).toBe(0);
  });

  it('getDateObject with 14 digit and random separators', () => {
    const dateString = '2023.08/31T11:22;33';

    const result = getDateObject(dateString);

    expect(result).toBeInstanceOf(Date);

    expect(result?.getFullYear()).toBe(2023);
    expect(result?.getMonth()).toBe(7);
    expect(result?.getDate()).toBe(31);
    expect(result?.getHours()).toBe(11);
    expect(result?.getMinutes()).toBe(22);
    expect(result?.getSeconds()).toBe(33);
    expect(result?.getMilliseconds()).toBe(0);
  });

  it('getDateObject with one digit parts and random separators', () => {
    const dateString = '2023.1/2 3 4|5';

    const result = getDateObject(dateString);

    expect(result).toBeInstanceOf(Date);

    expect(result?.getFullYear()).toBe(2023);
    expect(result?.getMonth()).toBe(0);
    expect(result?.getDate()).toBe(2);
    expect(result?.getHours()).toBe(3);
    expect(result?.getMinutes()).toBe(4);
    expect(result?.getSeconds()).toBe(5);
    expect(result?.getMilliseconds()).toBe(0);
  });
});
