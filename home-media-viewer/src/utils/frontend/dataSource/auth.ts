import { GeneralResponseWithData } from '@/types/api/generalTypes';
import { LoginRequestType, LoginResponseDataType } from '@/types/loginTypes';

export const apiLogin = async (args: LoginRequestType): Promise<LoginResponseDataType | null> => {
  const fetchArgs: RequestInit = {
    method: 'post',
    body: JSON.stringify({
      ...args,
    }),
  };

  const fetchResult = await fetch('/api/login', fetchArgs);
  const resultData: GeneralResponseWithData<LoginResponseDataType> = await fetchResult.json();

  if (!resultData.ok) {
    throw Error(resultData.error ?? 'Login failed');
  }

  return typeof resultData?.data === 'object' ? resultData.data : null;
};
