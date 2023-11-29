import { $Enums } from '@prisma/client';

export type DebugType = string | Array<string> | object;

export interface GeneralResponse {
  date: string;
  ok: boolean;
  id?: string;
  error?: string;
  debug?: DebugType;
}

export interface GeneralResponseWithData<T> extends GeneralResponse {
  data?: T;
}

export interface GeneralEntityListResponse<T> extends GeneralResponse {
  count: number;
  take: number;
  skip: number;
  data: Array<T>;
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
  id?: string | Array<string>;
}

export interface StatusSearchType extends IdSearchType {
  status?: $Enums.Status | Array<$Enums.Status>;
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

export interface EntityDataWithStatusType {
  status: $Enums.Status;
}

export interface EditEntityWithStatusType {
  status?: $Enums.Status;
}

export type DateFilter = {
  from?: string;
  to?: string;
  equals?: string;
};
