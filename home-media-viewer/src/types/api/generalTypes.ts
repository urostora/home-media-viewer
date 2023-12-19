import { type $Enums } from '@prisma/client';

export type DebugType = string | string[] | object;

export interface GeneralResponse {
  date: string;
  ok: boolean;
  id?: string;
  error?: string;
  debug?: DebugType;
}

export interface GeneralResponseParameters {
  ok?: boolean;
  id?: string;
  error?: string;
  debug?: DebugType;
}

export interface GeneralResponseWithData<T> extends GeneralResponse {
  data?: T;
}

export interface EntityListResult<T> {
  count: number;
  take?: number;
  skip: number;
  data: T[];
  debug?: DebugType;
}

export interface GeneralEntityListResponse<T> extends GeneralResponse {
  count: number;
  take?: number;
  skip: number;
  data: T[];
}

export interface GeneralMutationResponse<T> extends GeneralResponse {
  id: string;
  data: T;
}

export interface GeneralSearchType {
  take?: number | undefined;
  skip?: number | undefined;
}

export interface IdSearchType extends GeneralSearchType {
  id?: string | string[];
}

export interface StatusSearchType extends IdSearchType {
  status?: $Enums.Status | $Enums.Status[];
}

export enum Status {
  Active = 'Active',
  Deleted = 'Deleted',
  Disabled = 'Disabled',
}

export interface EntityType {
  id: string;
}

export interface EntityWithStatusType extends EntityType {
  status: $Enums.Status;
}

export interface EntityDataWithStatusType extends EntityType {
  status: $Enums.Status;
}

export interface EditEntityWithStatusType {
  status?: $Enums.Status;
}

export interface DateFilter {
  from?: string;
  to?: string;
  equals?: string;
}

export interface LocationFilter {
  latitude: number;
  longitude: number;
  distance?: number;
  latitudeTreshold?: number;
  longitudeTreshold?: number;
}
