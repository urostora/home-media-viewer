import { AlbumSourceType, Status } from '@prisma/client';
import type { EditEntityWithStatusType, StatusSearchType, EntityWithStatusType, DateFilter, EntityType } from './generalTypes';
import { AlbumSearchType } from './albumTypes';

export interface FileSearchType extends StatusSearchType {
  album?: EntityType;
  parentFileId?: string;
  name?: string;
  extension?: string;
  date?: DateFilter;
}

export interface FileUpdateType extends EntityWithStatusType { }
