import { GeneralResponse, GeneralResponseWithData } from '@/types/api/generalTypes';

export interface LoginRequestType {
  email: string;
  password: string;
}

export interface LoginResponseDataType {
  name: string;
  email: string;
  isAdmin: boolean;
}
