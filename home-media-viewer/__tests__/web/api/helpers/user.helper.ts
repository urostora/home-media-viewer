import { UserDataType, UserEditType } from '@/types/api/userTypes';
import { fetchDataFromApi } from './helper';
import { GeneralResponseWithData } from '@/types/api/generalTypes';

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

export const checkUserData = async (id: string, values: UserEditType) => {
  const path = `user/${id}`;

  const response = await fetchDataFromApi<GeneralResponseWithData<UserDataType>>(path);

  expect(response).not.toBeNull();
  expect(response?.ok).toBe(true);
  expect(response?.data).not.toBeNull();

  if (values?.email) {
    expect(response?.data?.email).toBe(values.email);
  }

  if (values?.name) {
    expect(response?.data?.name).toBe(values.name);
  }

  if (values?.isAdmin) {
    expect(response?.data?.isAdmin).toBe(values.isAdmin);
  }

  if (values?.status) {
    expect(response?.data?.status).toBe(values.status);
  }
};
