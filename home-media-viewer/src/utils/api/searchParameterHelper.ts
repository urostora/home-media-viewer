export interface InFilter<T> {
  in: T[];
}

export interface ContainsFilter {
  contains: string;
}

export type SimpleValueOrInFilter<T> = undefined | T | InFilter<T>;

export type StringContainsOrInFilter = undefined | ContainsFilter | InFilter<string>;

export function getSimpleValueOrInFilter<T>(value: undefined | null | T | T[] = undefined): SimpleValueOrInFilter<T> {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return { in: value };
  }

  return value;
}

export function getStringContainOrInFilter(
  value: undefined | null | string | string[] = undefined,
): StringContainsOrInFilter {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return { in: value };
  }

  return { contains: value };
}
