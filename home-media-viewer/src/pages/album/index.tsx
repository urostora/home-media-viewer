import AlbumList from '@/components/albumList';
import { AlbumResultType } from '@/types/api/albumTypes';
import { useRouter } from 'next/router';

const AlbumsPage = () => {
  const router = useRouter();

  const onAlbumSelected = (album: AlbumResultType) => {
    router.push(`/album/${album.id}`);
  }

  return <AlbumList onAlbumSelected={onAlbumSelected} />;
};

export default AlbumsPage;