import { getSimpleValueOrInFilter, getStringContainOrInFilter } from '@/utils/api/searchParameterHelper';

describe('utils/api/searchParameterHelper getSimpleValueOrInFilter', () => {
  it('undefined', () => {
    const input = undefined;
    const result = getSimpleValueOrInFilter<string>(input);
    expect(result).toBe(undefined);
  });

  it('null', () => {
    const input = null;
    const result = getSimpleValueOrInFilter<string>(input);
    expect(result).toBe(undefined);
  });

  it('single value', () => {
    const input = 'test value';
    const result = getSimpleValueOrInFilter<string>(input);

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result).toBe(input);
  });

  it('array of values', () => {
    const input = ['test value 1', 'test value 2'];
    const result = getSimpleValueOrInFilter<string>(input);

    expect(result).not.toBeNull();
    expect(typeof result).toBe('object');
    expect(result).toStrictEqual({
      in: input,
    });
  });
});

describe('utils/api/searchParameterHelper getStringContainOrInFilter', () => {
  it('undefined', () => {
    const input = undefined;
    const result = getStringContainOrInFilter(input);
    expect(result).toBe(undefined);
  });

  it('null', () => {
    const input = null;
    const result = getStringContainOrInFilter(input);
    expect(result).toBe(undefined);
  });

  it('single value', () => {
    const input = 'test value';
    const result = getStringContainOrInFilter(input);

    expect(result).not.toBeNull();
    expect(typeof result).toBe('object');
    expect(result).toStrictEqual({
      contains: input,
    });
  });

  it('array of values', () => {
    const input = ['test value 1', 'test value 2'];
    const result = getStringContainOrInFilter(input);

    expect(result).not.toBeNull();
    expect(typeof result).toBe('object');
    expect(result).toStrictEqual({
      in: input,
    });
  });
});
