import { getApiResponse, getApiResponseWithData, getApiResponseWithEntityList } from '@/utils/apiHelpers';
import { getDateObject } from '@/utils/utils';
import { $Enums } from '@prisma/client';

import type { EntityListResult, EntityWithStatusType, GeneralResponse } from '@/types/api/generalTypes';

const DATE_TRESHOLD_IN_MILLISEC = 1000;

const checkBasicApiResponseData = (
  result: GeneralResponse,
  dateBefore: Date,
  expectedOkValue: boolean = true,
): void => {
  // date
  expect(typeof result.date).toEqual('string');

  // ok
  expect(typeof result?.ok).toEqual('boolean');
  expect(result.ok).toBe(expectedOkValue);

  const date = getDateObject(result.date);

  expect(date?.getTime()).toBeGreaterThanOrEqual(dateBefore.getTime() - DATE_TRESHOLD_IN_MILLISEC);
  expect(date?.getTime()).toBeLessThan(dateBefore.getTime() + DATE_TRESHOLD_IN_MILLISEC);
};

describe('utils/apiHelper/getApiResponse', () => {
  it('empty api response', () => {
    const dateBefore = new Date();

    const result = getApiResponse();

    expect(typeof result).toBe('object');

    checkBasicApiResponseData(result, dateBefore);
  });

  it('api response with error', () => {
    const dateBefore = new Date();

    const content = {
      error: 'This is the error message',
    };

    const result = getApiResponse(content);

    expect(typeof result).toBe('object');

    checkBasicApiResponseData(result, dateBefore, false);

    // error
    expect(typeof result?.error).toBe('string');
    expect(result.error).toBe(content.error);
  });

  it('api response with id', () => {
    const dateBefore = new Date();

    const content = {
      id: 'qwer-23465-dthdyh-w53464',
    };

    const result = getApiResponse(content);

    expect(typeof result).toBe('object');

    checkBasicApiResponseData(result, dateBefore);

    // id
    expect(typeof result?.id).toBe('string');
    expect(result.id).toBe(content.id);
  });
});

describe('utils/apiHelper/getApiResponseWithData', () => {
  it('api response with data', () => {
    const dateBefore = new Date();

    const data = {
      id: '1234',
      status: $Enums.Status.Active,
    };

    const result = getApiResponseWithData<EntityWithStatusType>(data);

    expect(typeof result).toBe('object');

    checkBasicApiResponseData(result, dateBefore);

    // check data
    expect(typeof result?.data).toEqual('object');
    expect(result.data).toEqual(data);
  });
});

describe('utils/apiHelper/getApiResponseWithData', () => {
  it('api response with data', () => {
    const dateBefore = new Date();

    const data: EntityListResult<EntityWithStatusType> = {
      count: 2,
      skip: 0,
      take: 10,
      data: [
        {
          id: '1234',
          status: $Enums.Status.Active,
        },
        {
          id: '5678',
          status: $Enums.Status.Disabled,
        },
      ],
    };

    const result = getApiResponseWithEntityList<EntityWithStatusType>(data);

    expect(typeof result).toBe('object');

    checkBasicApiResponseData(result, dateBefore);

    // check data
    expect(result.count).toBe(2);
    expect(result.take).toBe(10);
    expect(result.skip).toBe(0);
    expect(typeof result?.data).toEqual('object');
    expect(result.data).toEqual(data.data);
  });
});
