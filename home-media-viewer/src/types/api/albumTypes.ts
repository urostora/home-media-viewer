import { AlbumSourceType, Status } from '@prisma/client';
import type { EditEntityWithStatusType, StatusSearchType, EntityWithStatusType } from './generalTypes';

export interface AlbumSearchType extends StatusSearchType {
  name?: string;
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
