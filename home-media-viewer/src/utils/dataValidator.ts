import { $Enums } from '@prisma/client';

import { HmvError } from './apiHelpers';

export interface DataValidatorField {
  field: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'bigint';
  isRequired?: boolean;
  isArrayAllowed?: boolean;
  valuesAllowed?: unknown[];
}

export type DataValidatorSchema = DataValidatorField[];

export const statusValues = Object.values($Enums.Status);

export const metadataProcessingStatusValues = Object.values($Enums.MetadataProcessingStatus);

export const validateData = (data: object | null | undefined, schema: DataValidatorSchema): boolean => {
  if (data === null || data === undefined || typeof data !== 'object') {
    throw new HmvError('Input data not available', { isPublic: true });
  }

  for (const fieldConfig of schema) {
    const { field, type = 'string', isRequired = false, isArrayAllowed = false, valuesAllowed } = fieldConfig;

    if (!(field in data)) {
      if (isRequired) {
        throw new HmvError(`field "${field}" is required`, { isPublic: true });
      }

      continue;
    }

    const value = data[field as keyof typeof data];

    if (Array.isArray(value)) {
      if (!isArrayAllowed) {
        throw new HmvError(`field "${field}" has invalid array value, type must be ${type}`, { isPublic: true });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr: any[] = value;
      for (const arrayValue of arr) {
        if (typeof arrayValue !== type) {
          throw new HmvError(`field "${field}" has an invalid array item, type must be ${type}`, { isPublic: true });
        }

        if (Array.isArray(valuesAllowed) && !valuesAllowed.includes(arrayValue)) {
          throw new HmvError(`field "${field}" has an unsupported array item`, { isPublic: true });
        }
      }
    } else {
      if (typeof value !== type) {
        throw new HmvError(`field "${field}" has an invalid value, type must be ${type}`, { isPublic: true });
      }

      if (Array.isArray(valuesAllowed) && !valuesAllowed.includes(value)) {
        throw new HmvError(`field "${field}" has an unsupported value`, {
          isPublic: true,
        });
      }
    }
  }

  return true;
};
