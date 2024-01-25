import { getDateObject, getDateTimeFilter } from '@/utils/utils';

import type { Prisma } from '@prisma/client';
import { type DateFilter } from '@/types/api/generalTypes';

describe('utils/utils getDateObject', () => {
  it('with undefined', () => {
    const dateString = undefined;
    const result = getDateObject(dateString);
    expect(result).toBeNull();
  });

  it('with null', () => {
    const dateString = null;
    const result = getDateObject(dateString);
    expect(result).toBeNull();
  });

  it('with invalid string', () => {
    const dateString = 'duj67r45yrhe65y54378';
    const result = getDateObject(dateString);
    expect(result).toBeNull();
  });

  it('with invalid date parts', () => {
    const dateString = '2023.13.40 22:47:37';
    const result = getDateObject(dateString);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(new Date(2024, 0, 40, 22, 47, 37, 0).getTime());
  });

  it('with 8 digit', () => {
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

  it('with 8 digit separated by -', () => {
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

  it('with 8 digit separated by .', () => {
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

  it('with 10 digit', () => {
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

  it('with 12 digit', () => {
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

  it('with 14 digit', () => {
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

  it('with 14 digit and random separators', () => {
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

  it('with one digit parts and random separators', () => {
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

describe('utils/utils getDateTimeFilter', () => {
  it('return undefined when undefined', () => {
    const result = getDateTimeFilter(undefined);

    expect(typeof result).toBe('undefined');
  });

  it('return undefined when empty', () => {
    const result = getDateTimeFilter({});

    expect(typeof result).toBe('undefined');
  });

  it('equals', () => {
    const input: DateFilter = {
      equals: '2023.11.22',
    };
    const result = getDateTimeFilter(input);

    const expected: Prisma.DateTimeFilter = {
      equals: new Date(2023, 10, 22, 0, 0, 0, 0),
    };

    expect(result).toStrictEqual(expected);
  });

  it('interval', () => {
    const input: DateFilter = {
      from: '2022.11.22',
      to: '2023.02.26 14:15:26',
    };
    const result = getDateTimeFilter(input);

    const expected: Prisma.DateTimeFilter = {
      gte: new Date(2022, 10, 22, 0, 0, 0, 0),
      lt: new Date(2023, 1, 26, 14, 15, 26, 0),
    };

    expect(result).toStrictEqual(expected);
  });

  it('from', () => {
    const input: DateFilter = {
      from: '2022.11.22',
    };
    const result = getDateTimeFilter(input);

    const expected: Prisma.DateTimeFilter = {
      gte: new Date(2022, 10, 22, 0, 0, 0, 0),
    };

    expect(result).toStrictEqual(expected);
  });

  it('to', () => {
    const input: DateFilter = {
      to: '2023.02.26 14:15:26',
    };
    const result = getDateTimeFilter(input);

    const expected: Prisma.DateTimeFilter = {
      lt: new Date(2023, 1, 26, 14, 15, 26, 0),
    };

    expect(result).toStrictEqual(expected);
  });
});
