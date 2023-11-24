import { AlbumSourceType, Status } from '@prisma/client';
import type { EditEntityWithStatusType, StatusSearchType, EntityWithStatusType } from './generalTypes';

export interface AlbumSearchType extends StatusSearchType {
  name?: string;
  basePathContains?: string;
  basePath?: string;
  sourceType?: AlbumSourceType;
  user?: string;
}

export interface AlbumUpdateType extends EditEntityWithStatusType {
  name?: string;
}

export interface AlbumAddType {
  path?: string;
  type?: AlbumSourceType;
  name?: string;
}

export interface AlbumFile {
  id: string;
  thumbnailImage?: string;
}

export interface AlbumResultType {
  id?: string;
  name?: string;
  files?: AlbumFile[];
}

export interface AlbumDetailsFileStatusType {
  metadataStatus: string;
  fileCount: number;
}
export interface AlbumDetailsType {
  id?: string;
  status?: Status;
  name?: string;
  sourceType?: string;
  basePath?: string;
  connectionString?: string;
  fileStatus?: AlbumDetailsFileStatusType[];
}