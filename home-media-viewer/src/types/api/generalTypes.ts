export interface GeneralResponse {
  date: string;
  ok: boolean;
  error?: string;
  count?: number;
}

export interface GeneralResponseWithData<T> {
  date: string;
  ok: boolean;
  error?: string;
  count?: number;
  data?: T;
}

export interface GeneralEntityListResponse<T> extends GeneralResponse {
  count: number;
  data: Array<T>;
}

export interface GeneralMutationResponse extends GeneralResponse {
  id?: string;
  data?: object;
}

export interface GeneralSearchType {
  take?: number | null;
  skip?: number;
}

export interface IdSearchType extends GeneralSearchType {
  id?: string;
}

export interface StatusSearchType extends IdSearchType {
  status?: Status;
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
  status: Status;
}

export interface EditEntityType {
  id?: string;
}

export interface EditEntityWithStatusType extends EditEntityType {
  status?: Status | Status[];
}

export type DateFilter = {
  from?: string;
  to?: string;
  equals?: string;
};
