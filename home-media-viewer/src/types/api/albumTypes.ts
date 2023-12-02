import { $Enums, AlbumSourceType, Status } from '@prisma/client';
import type { EditEntityWithStatusType, EntityDataWithStatusType, EntityType, StatusSearchType } from './generalTypes';
import { UserConnectedDataType } from './userTypes';

export interface AlbumSearchType extends StatusSearchType {
  name?: string;
  basePathContains?: string;
  basePath?: string;
  user?: string;
  status?: $Enums.Status;
}

export interface AlbumUpdateType extends EditEntityWithStatusType {
  name?: string;
  status?: Status;
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
export interface AlbumDataType extends EntityDataWithStatusType {
  name: string;
  sourceType: string;
  connectionString: string;
  basePath: string;
  parentAlbumId: string | null;
}

export interface AlbumExtendedDataType extends AlbumDataType {
  fileStatus: AlbumDetailsFileStatusType[];
  users?: UserConnectedDataType[];
}

export interface AlbumConnectedData extends EntityType {
  name: string;
}
