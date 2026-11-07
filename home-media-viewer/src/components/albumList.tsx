import { type JSX, useEffect, useState } from 'react';

import { apiLoadAlbums } from '@/utils/frontend/dataSource/album';
import ContentList from './content/contentList';
import ScrollPositionReset from '@/utils/frontend/scrollPositionResetHandler';

import type { AlbumExtendedResultType, AlbumResultType } from '@/types/api/albumTypes';

import hmvStyle from '@/styles/hmv.module.scss';

export interface AlbumListPropsType {
  onAlbumSelected?: (album: AlbumResultType) => void;
}

type AlbumOrder = 'nameAsc' | 'nameDesc' | 'dateAsc' | 'dateDesc';
const ALBUM_ORDER_KEY = 'hmv:album-order';
const isAlbumOrder = (value: unknown): value is AlbumOrder =>
  value === 'nameAsc' || value === 'nameDesc' || value === 'dateAsc' || value === 'dateDesc';

const initialOrder = (): AlbumOrder => {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(ALBUM_ORDER_KEY);
      if (isAlbumOrder(saved)) return saved;
    } catch {
      // Storage may be disabled; sorting still works for the current list.
    }
  }
  return 'dateDesc';
};

export default function AlbumList(props: AlbumListPropsType): JSX.Element {
  const [albumData, setAlbumData] = useState<AlbumExtendedResultType[] | null>(null);
  const [order, setOrder] = useState<AlbumOrder>(initialOrder);
  const [error, setError] = useState<string | undefined>(undefined);
  const [scrollResetCompleted, setScrollResetCompleted] = useState<boolean>(false);

  const { onAlbumSelected } = props;

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        const results = await apiLoadAlbums({ take: 0, returnThumbnails: false });
        setAlbumData(results);
      } catch (error) {
        setError(`${error}`);
      }
    };

    void fetchData();
  }, []);

  const onAlbumSelectedHandler = (album: AlbumResultType): void => {
    ScrollPositionReset.lastAlbumSelected = album.id;

    if (typeof onAlbumSelected === 'function') {
      onAlbumSelected(album);
    }
  };

  useEffect(() => {
    if (scrollResetCompleted || !Array.isArray(albumData)) {
      return;
    }
    const lastSelectedAlbumId = ScrollPositionReset.lastAlbumSelected;
    if (lastSelectedAlbumId === undefined) {
      return;
    }
    const timeout = setTimeout(() => {
      ScrollPositionReset.scrollToLastElement(lastSelectedAlbumId);
      ScrollPositionReset.lastAlbumSelected = undefined;
      setScrollResetCompleted(true);
    }, 100);
    return () => {
      clearTimeout(timeout);
    };
  }, [scrollResetCompleted, albumData]);

  const onOrderChanged = (e: React.FormEvent<HTMLSelectElement>): void => {
    const newValue = e.currentTarget.value;

    if (isAlbumOrder(newValue)) {
      setOrder(newValue);
      try {
        window.localStorage.setItem(ALBUM_ORDER_KEY, newValue);
      } catch {
        // Keep the selected order usable even when it cannot be persisted.
      }
    }
  };

  // show error if available
  if (error !== undefined) {
    return (
      <div role="alert" className={hmvStyle.errorContainer}>
        {error}
      </div>
    );
  }

  // get content
  if (albumData === null) {
    // no album selected, load albums first
    return <>Loading albums...</>;
  }

  if (albumData.length === 0) {
    return <p>No albums found</p>;
  }

  albumData?.sort((a1: AlbumExtendedResultType, a2: AlbumExtendedResultType) => {
    if (
      ['dateAsc', 'dateDesc'].includes(order) &&
      a1.thumbnailFile !== null &&
      a1.thumbnailFile?.contentDate !== undefined &&
      a2?.thumbnailFile !== null &&
      a2.thumbnailFile?.contentDate !== undefined
    ) {
      return a1.thumbnailFile.contentDate.localeCompare(a2.thumbnailFile.contentDate) * (order === 'dateDesc' ? -1 : 1);
    }

    return a1.name.localeCompare(a2.name) * (order === 'nameDesc' ? -1 : 1);
  });

  return (
    <>
      <div className={hmvStyle.navigationBar}>
        <div className={hmvStyle.leftSide}>
          <div>
            <h1 className={hmvStyle.pageTitle}>Your albums</h1>
            <p className={hmvStyle.pageDescription}>Photos, videos, and moments worth keeping.</p>
          </div>
        </div>
        <div className={hmvStyle.rightSide}>
          <div className={hmvStyle.selectWrapper}>
            <select
              aria-label="Sort albums"
              className={hmvStyle.roundedElement}
              value={order}
              onChange={onOrderChanged}
            >
              <option value="nameAsc">Name ascending</option>
              <option value="nameDesc">Name descending</option>
              <option value="dateAsc">Date ascending</option>
              <option value="dateDesc">Date descending</option>
            </select>
          </div>
        </div>
      </div>
      <ContentList data={albumData} contentSelected={onAlbumSelectedHandler} />
    </>
  );
}
