import { $Enums } from '@prisma/client';

export interface DataValidatorField {
  field: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'bigint';
  isRequired?: boolean;
  isArrayAllowed?: boolean;
  valuesAllowed?: Array<string>;
}

export type DataValidatorSchema = Array<DataValidatorField>;

export const statusValues = Object.values($Enums.Status);

export const validateData = (data: object, schema: DataValidatorSchema): boolean => {
  for (const fieldConfig of schema) {
    const { field, type = 'string', isRequired = false, isArrayAllowed = false, valuesAllowed } = fieldConfig;

    if (field in data === false) {
      if (isRequired) {
        throw { publicError: `field "${field}" is required` };
      }

      continue;
    }

    const value = data[field as keyof typeof data];

    if (Array.isArray(value)) {
      if (isArrayAllowed !== true) {
        throw { publicError: `field "${field}" has invalid array value, type must be ${type}` };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr: Array<any> = value;
      for (const arrayValue of arr) {
        if (typeof arrayValue != type) {
          throw {
            publicError: `field "${field}" has invalid value in array ${arrayValue}, type must be '${type}' instead of '${type}'`,
          };
        }

        if (Array.isArray(valuesAllowed) && !valuesAllowed.includes(arrayValue)) {
          throw {
            publicError: `field "${field}" array value must be one of the following: [${valuesAllowed.join(', ')}]`,
          };
        }
      }
    } else {
      if (typeof value != type) {
        throw { publicError: `field "${field}" has invalid value ${value}, type must be ${type}` };
      }

      if (Array.isArray(valuesAllowed) && !valuesAllowed.includes(value)) {
        throw { publicError: `field "${field}" value must be one of the following: [${valuesAllowed.join(', ')}]` };
      }
    }
  }

  return true;
};
