import { type AlbumConnectedData } from './albumTypes';
import type { EditEntityWithStatusType, StatusSearchType, EntityWithStatusType } from './generalTypes';

export interface UserSearchType extends StatusSearchType {
  name?: string | string[];
  email?: string | string[];
  isAdmin?: boolean;
}

export interface UserAddType {
  name: string;
  email: string;
  password: string;
}

export interface UserEditType extends EditEntityWithStatusType {
  name?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
}

export interface UserConnectedDataType extends EntityWithStatusType {
  name: string;
  isAdmin: boolean;
}

export interface UserDataType extends UserConnectedDataType {
  email: string;
}

export interface UserExtendedDataType extends UserDataType {
  albums: AlbumConnectedData[];
}

export interface UserAlbumConnectType {
  userId: string;
  albumId: string;
}

export interface UserSessionData {
  id: string;
  admin?: boolean;
}
