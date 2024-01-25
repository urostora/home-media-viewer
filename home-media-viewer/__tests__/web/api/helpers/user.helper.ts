import { fetchDataFromApi } from './helper';

import type { GeneralResponseWithData } from '@/types/api/generalTypes';
import type { UserDataType, UserEditType } from '@/types/api/userTypes';

const customNamePart = `${new Date().getTime()}`;
const validPassword = 'Password_4-Guest|User';

export const getTestUserData = (namePrefix: string = 'guest', isAdmin: boolean = false): UserEditType => {
  return {
    email: `${namePrefix}user@guest.${customNamePart}.com`,
    name: `${namePrefix} user ${customNamePart}`,
    password: validPassword,
    isAdmin,
  };
};

export const checkUserData = async (id: string, values: UserEditType): Promise<void> => {
  const path = `user/${id}`;

  const response = await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(path);

  expect(response).not.toBeNull();
  expect(response?.ok).toBe(true);
  expect(response?.data).not.toBeNull();

  if (typeof values?.email === 'string') {
    expect(response?.data?.email).toBe(values.email);
  }

  if (typeof values?.name === 'string') {
    expect(response?.data?.name).toBe(values.name);
  }

  if (typeof values?.isAdmin === 'boolean') {
    expect(response?.data?.isAdmin).toBe(values.isAdmin);
  }

  if (typeof values?.status !== 'undefined') {
    expect(response?.data?.status).toBe(values.status);
  }
};
