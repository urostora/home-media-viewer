import { $Enums } from '@prisma/client';
import { HmvError } from './apiHelpers';

export interface DataValidatorField {
  field: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'bigint';
  isRequired?: boolean;
  isArrayAllowed?: boolean;
  valuesAllowed?: Array<string>;
}

export type DataValidatorSchema = Array<DataValidatorField>;

export const statusValues = Object.values($Enums.Status);

export const validateData = (data: object | null | undefined, schema: DataValidatorSchema): boolean => {
  if (!data) {
    throw new HmvError('Input data not available', { isPublic: true });
  }

  for (const fieldConfig of schema) {
    const { field, type = 'string', isRequired = false, isArrayAllowed = false, valuesAllowed } = fieldConfig;

    if (field in data === false) {
      if (isRequired) {
        throw new HmvError(`field "${field}" is required`, { isPublic: true });
      }

      continue;
    }

    const value = data[field as keyof typeof data];

    if (Array.isArray(value)) {
      if (isArrayAllowed !== true) {
        throw new HmvError(`field "${field}" has invalid array value, type must be ${type}`, { isPublic: true });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr: Array<any> = value;
      for (const arrayValue of arr) {
        if (typeof arrayValue != type) {
          throw new HmvError(
            `field "${field}" has invalid value in array ${arrayValue}, type must be '${type}' instead of '${type}'`,
            { isPublic: true },
          );
        }

        if (Array.isArray(valuesAllowed) && !valuesAllowed.includes(arrayValue)) {
          throw new HmvError(
            `field "${field}" array value must be one of the following: [${valuesAllowed.join(', ')}]`,
            { isPublic: true },
          );
        }
      }
    } else {
      if (typeof value != type) {
        throw new HmvError(`field "${field}" has invalid value ${value}, type must be ${type}`, { isPublic: true });
      }

      if (Array.isArray(valuesAllowed) && !valuesAllowed.includes(value)) {
        throw new HmvError(`field "${field}" value must be one of the following: [${valuesAllowed.join(', ')}]`, {
          isPublic: true,
        });
      }
    }
  }

  return true;
};
