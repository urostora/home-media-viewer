import { HmvError } from '@/utils/apiHelpers';
import { DataValidatorSchema, validateData } from '@/utils/dataValidator';

describe('utils/dataValidator', () => {
  it('data is null', () => {
    expect(() => validateData(null, [])).toThrow(HmvError);
  });

  it('data is undefined', () => {
    expect(() => validateData(undefined, [])).toThrow(HmvError);
  });

  it('simple string', () => {
    const schema: DataValidatorSchema = [{ field: 'field1' }];
    const data = {
      field1: 'someString',
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('simple string not set', () => {
    const schema: DataValidatorSchema = [{ field: 'field1' }];
    const data = {
      field2: 'someString',
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('required field not set', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', isRequired: true }];
    const data = {
      field2: 'someString',
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });

  it('string field set to allowed value', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', valuesAllowed: ['allowed1', 'allowed2'] }];
    const data = {
      field1: 'allowed1',
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('string field not set with allowed value', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', valuesAllowed: ['allowed1', 'allowed2'] }];
    const data = {
      field2: 'allowed1',
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('string field set with not allowed value', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', valuesAllowed: ['allowed1', 'allowed2'] }];
    const data = {
      field1: 'notAllowedValue',
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });

  it('simple number', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', type: 'number' }];
    const data = {
      field1: 123.456,
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('simple number invalid type', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', type: 'number' }];
    const data = {
      field1: true,
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });

  it('simple boolean', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', type: 'boolean' }];
    const data = {
      field1: true,
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('simple boolean invalid type', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', type: 'boolean' }];
    const data = {
      field1: 123.456,
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });

  it('simple object', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', type: 'object' }];
    const data = {
      field1: { key: 'value' },
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('simple object invalid type', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', type: 'object' }];
    const data = {
      field1: 'object',
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });

  it('array data enabled', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', isArrayAllowed: true }];
    const data = {
      field1: ['value1', 'value2'],
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('array not enabled implicitly', () => {
    const schema: DataValidatorSchema = [{ field: 'field1' }];
    const data = {
      field1: ['value1', 'value2'],
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });

  it('array not enabled explicitly', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', isArrayAllowed: false }];
    const data = {
      field1: ['value1', 'value2'],
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });

  it('array data enabled number type', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', type: 'number', isArrayAllowed: true }];
    const data = {
      field1: [6543, 6435.3456],
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('array with invalid typed value', () => {
    const schema: DataValidatorSchema = [{ field: 'field1', isArrayAllowed: true }];
    const data = {
      field1: ['value1', 123.456],
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });

  it('array only with allowed values', () => {
    const schema: DataValidatorSchema = [
      { field: 'field1', isArrayAllowed: true, valuesAllowed: ['allowed1', 'allowed2'] },
    ];
    const data = {
      field1: ['allowed2', 'allowed1'],
    };

    expect(validateData(data, schema)).toBe(true);
  });

  it('array with not allowed value', () => {
    const schema: DataValidatorSchema = [
      { field: 'field1', isArrayAllowed: true, valuesAllowed: ['allowed1', 'allowed2'] },
    ];
    const data = {
      field1: ['allowed2', 'notAllowed1'],
    };

    expect(() => validateData(data, schema)).toThrow(HmvError);
  });
});
