import { AlbumSourceType, MetadataProcessingStatus, Status } from '@prisma/client';
import type {
  EditEntityWithStatusType,
  StatusSearchType,
  EntityWithStatusType,
  DateFilter,
  EntityType,
} from './generalTypes';
import { AlbumSearchType } from './albumTypes';

export interface FileSearchType extends StatusSearchType {
  album?: EntityType;
  parentFileId?: string;
  name?: string;
  extension?: string;
  pathBeginsWith?: string;
  fileDate?: DateFilter;
  contentDate?: DateFilter;
  metadataStatus?: MetadataProcessingStatus;
}

export interface FileUpdateType extends EntityWithStatusType {}
