import AlbumList from '@/components/albumList';
import { type AlbumResultType } from '@/types/api/albumTypes';
import { useRouter } from 'next/router';

const Page = (): JSX.Element => {
  
  const router = useRouter();

  const onAlbumSelected = (album: AlbumResultType): void => {
    void router.push(`/album/${album.id}`);
  }

  return <AlbumList onAlbumSelected={onAlbumSelected} />;
};

export default Page;
