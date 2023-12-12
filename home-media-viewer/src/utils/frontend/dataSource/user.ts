import { type GeneralEntityListResponse, type GeneralResponse, type GeneralResponseWithData } from '@/types/api/generalTypes';
import { type UserAddType, type UserDataType, type UserEditType, type UserExtendedDataType, type UserSearchType } from '@/types/api/userTypes';

export const apiLoadUsers = async (args: UserSearchType): Promise<UserDataType[]> => {
  const fetchArgs: RequestInit = {
    method: 'post',
    body: JSON.stringify({
      status: 'Active',
      metadataStatus: 'Processed',
      ...args,
    }),
  };

  const fetchResult = await fetch('/api/user/search', fetchArgs);

  if (!fetchResult.ok) {
    const errorText = await fetchResult.text();
    throw Error(errorText);
  }

  const resultData: GeneralEntityListResponse<UserDataType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not load users');
  }

  if (!Array.isArray(resultData?.data)) {
    throw Error(resultData.error ?? 'Result empty');
  }

  return resultData.data;
};

export const apiAddUser = async (data: UserAddType): Promise<UserDataType> => {
  const fetchArgs: RequestInit = {
    method: 'PUT',
    body: JSON.stringify(data),
  };

  const fetchResult = await fetch('/api/user', fetchArgs);

  if (!fetchResult.ok) {
    const errorText = await fetchResult.text();
    throw Error(errorText);
  }

  const resultData: GeneralResponseWithData<UserDataType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not add user');
  }

  if (typeof resultData?.data !== 'object') {
    throw Error(resultData.error ?? 'Result empty');
  }

  return resultData.data ;
};

export const apiEditUser = async (id: string, data: UserEditType): Promise<UserDataType> => {
  const fetchArgs: RequestInit = {
    method: 'PATCH',
    body: JSON.stringify(data),
  };

  const fetchResult = await fetch(`/api/user/${id}`, fetchArgs);

  if (!fetchResult.ok) {
    const errorText = await fetchResult.text();
    throw Error(errorText);
  }

  const resultData: GeneralResponseWithData<UserDataType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not modify user');
  }

  if (typeof resultData?.data !== 'object') {
    throw Error(resultData.error ?? 'Result empty');
  }

  return resultData.data ;
};

export const apiDeletetUser = async (id: string): Promise<UserDataType> => {
  const fetchArgs: RequestInit = {
    method: 'DELETE',
  };

  const fetchResult = await fetch(`/api/user/${id}`, fetchArgs);

  if (!fetchResult.ok) {
    const errorText = await fetchResult.text();
    throw Error(errorText);
  }

  const resultData: GeneralResponseWithData<UserDataType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could not delete user');
  }

  if (typeof resultData?.data !== 'object') {
    throw Error(resultData.error ?? 'Result empty');
  }

  return resultData.data ;
};

export const apiGetUserData = async (id: string): Promise<UserExtendedDataType> => {
  const fetchArgs: RequestInit = {
    method: 'GET',
  };

  const fetchResult = await fetch(`/api/user/${id}`, fetchArgs);

  if (!fetchResult.ok) {
    const errorText = await fetchResult.text();
    throw Error(errorText);
  }

  const resultData: GeneralResponseWithData<UserDataType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could get user data');
  }

  if (typeof resultData?.data !== 'object') {
    throw Error(resultData.error ?? 'Result empty');
  }

  return resultData.data as UserExtendedDataType;
};

export const apiUserAlbumConnection = async (userId: string, albumId: string, connect: boolean): Promise<boolean> => {
  const fetchArgs: RequestInit = {
    method: connect ? 'PUT' : 'DELETE',
    body: JSON.stringify({
      albumId,
      userId,
    }),
  };

  const fetchResult = await fetch('/api/user/album', fetchArgs);

  if (!fetchResult.ok) {
    const errorText = await fetchResult.text();
    throw Error(errorText);
  }

  const resultData: GeneralResponse = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Could get user data');
  }

  return resultData.ok;
};
