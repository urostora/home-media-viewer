import { AlbumSourceType, MetadataProcessingStatus, Status, FileMetaType } from '@prisma/client';
import type {
  EditEntityWithStatusType,
  StatusSearchType,
  EntityWithStatusType,
  DateFilter,
  EntityType,
} from './generalTypes';
import { AlbumResultType, AlbumSearchType } from './albumTypes';

export interface FileSearchType extends StatusSearchType {
  album?: EntityType;
  parentFileId?: string | null;
  name?: string;
  extension?: string;
  pathBeginsWith?: string;
  pathIsExactly?: string;
  fileDate?: DateFilter;
  contentDate?: DateFilter;
  metadataStatus?: MetadataProcessingStatus;
  isDirectory?: boolean;
  user?: string;
}

export interface FileMetadataType {
  type: FileMetaType;
  metaKey: string;
  stringValue: string | null;
  intValue: number | null;
  floatValue: number | null;
  dateValue: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface FileResultType {
  id: string;
  status: Status;
  path: string;
  name: string;
  extension: string;
  isDirectory: boolean;
  createdAt: string;
  modifiedAt: string;
  contentDate: string | null;
  size: number | null;
  hash: string | null;
  metadataStatus: MetadataProcessingStatus;
  metadataProcessedAt: string | null;
  metadataProcessingError: string | null;
  thumbnailStatus: MetadataProcessingStatus;
  thumbnailProcessedAt: string | null;
  albumId: string;
  parentFileId: string | null;
  metas: FileMetadataType[];
  thumbnail: string | null;
}

export interface FileUpdateType extends EntityWithStatusType {}
