import { isPasswordStrong } from '@/utils/userHelper';

test.each<[string, string, boolean]>([
  // [ test name, input, result]
  ['passing', 'AsdfQwer1234-_|', true],
  ['no special character', 'AsdfQwer1234', false],
  ['no uppercase character', 'asdfqwer1234?_.,%^/', false],
  ['no lowercase character', 'ASDFQWER1234<>}"?}', false],
  ['no numeric character', 'AsdfQwer}_:">&^%#$', false],
  ['4 character password - short', 'As1-', false],
  ['7 character password - short', 'Asd123-', false],
  ['8 character password - ok', 'Asd123-+', true],
])('utils/userHelper/isPasswordStrong %s', (description, password, expectedResult): void => {
  const result = isPasswordStrong(password);

  expect(result).toBe(expectedResult);
});
