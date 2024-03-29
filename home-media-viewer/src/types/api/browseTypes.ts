import { type AlbumDataType } from './albumTypes';
import { type FileResultType } from './fileTypes';

export interface BrowseResult {
  relativePath: string;
  /** Current path is a directory stored as file object */
  storedDirectory: FileResultType | null;
  /** Current path is an album root directory */
  albumExactly: AlbumDataType | null;
  /** Current path is inside a stored album path */
  albumContains: AlbumDataType[];
  /** Files and directories found in current path */
  content: BrowseResultFile[];
}

export interface BrowseResultFile {
  /** name and extension */
  name: string;
  /** relative to album root */
  path: string;
  pathRelativeToAlbum: string | null;
  isDirectory: boolean;
  size: number;
  dateCreatedOn: Date;
  dateModifiedOn: Date;
  /** file object stored in database */
  storedFile: FileResultType | null;
  storedAlbum: AlbumDataType | null;
  exactAlbum: AlbumDataType | null;
}
