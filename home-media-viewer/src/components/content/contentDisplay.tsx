import { type FileResultType } from '@/types/api/fileTypes';
import hmvStyle from '@/styles/hmv.module.scss';
import { type JSX, type ReactElement, useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '@/components/auth/authContext';
import { apiFileUpdateVideoThumbnail } from '@/utils/frontend/dataSource/file';
import { getContentUrl, getThumbnailUrl, isImageByExtension, isVideoByExtension } from '@/utils/frontend/contentUtils';
import { thumbnailSize } from '@/utils/frontend/thumbnailUtils';

interface ContentDisplayProps {
  content?: FileResultType;
  closeHandler?: () => void;
  previousHandler?: () => void;
  nextHandler?: () => void;
  onThumbnailUpdated?: (file: FileResultType) => void;
}

const getImageUrl = (id: string): string => {
  if (window === undefined) {
    return getContentUrl(id);
  }

  if (window.innerWidth <= thumbnailSize.medium) {
    return getThumbnailUrl(id, thumbnailSize.medium);
  } else if (window.innerWidth <= thumbnailSize.large) {
    return getThumbnailUrl(id, thumbnailSize.large);
  }

  return getContentUrl(id);
};

// A new file gets a fresh player and request state, including when navigating back.
const ContentDisplay = (props: ContentDisplayProps): JSX.Element => (
  <ContentDisplayForFile key={props.content?.id} {...props} />
);

const ContentDisplayForFile = (props: ContentDisplayProps): JSX.Element => {
  const { content, closeHandler, previousHandler, nextHandler, onThumbnailUpdated } = props;
  const { isAdmin } = useContext(AuthContext);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const requestPending = useRef(false);
  const [frameReady, setFrameReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canCaptureFrame = (): boolean => {
    const video = videoRef.current;
    return (
      video !== null &&
      video.readyState >= 2 &&
      !video.seeking &&
      Number.isFinite(video.currentTime) &&
      video.currentTime >= 0 &&
      Number.isFinite(video.duration) &&
      video.currentTime < video.duration
    );
  };

  const updateFrameReady = (): void => {
    setFrameReady(canCaptureFrame());
  };

  const updateThumbnail = async (): Promise<void> => {
    if (
      isAdmin !== true ||
      content === undefined ||
      !isVideoByExtension(content.extension) ||
      requestPending.current ||
      !canCaptureFrame()
    )
      return;
    const id = content.id;
    const time = videoRef.current!.currentTime;
    requestPending.current = true;
    setPending(true);
    setMessage('Updating thumbnail…');
    setError('');
    try {
      const file = await apiFileUpdateVideoThumbnail(id, time);
      // Callers update by ID, even if this player has since been closed or replaced.
      onThumbnailUpdated?.(file);
      if (mounted.current) setMessage('Thumbnail updated');
    } catch (e) {
      if (mounted.current) {
        setMessage('');
        setError(e instanceof Error ? e.message : 'Could not update thumbnail');
      }
    } finally {
      requestPending.current = false;
      if (mounted.current) setPending(false);
    }
  };

  if (content === undefined) {
    return <></>;
  }

  const getContentElement = (content: FileResultType): ReactElement => {
    if (isImageByExtension(content.extension)) {
      const thumbnailLink = getImageUrl(content.id);
      return <img src={thumbnailLink} alt={content.path} />;
    } else if (isVideoByExtension(content.extension)) {
      const contentLink = getContentUrl(content.id);
      return (
        <video
          ref={videoRef}
          controls
          src={contentLink}
          onLoadedData={updateFrameReady}
          onDurationChange={updateFrameReady}
          onTimeUpdate={updateFrameReady}
          onSeeking={updateFrameReady}
          onSeeked={updateFrameReady}
          onEmptied={() => setFrameReady(false)}
          onError={() => setFrameReady(false)}
        />
      );
    }

    return <></>;
  };

  const onBackgroundClicked = (e: React.MouseEvent<HTMLElement>): void => {
    const targetElement = e.target as HTMLElement;

    if (targetElement.tagName.toLowerCase() === 'img') {
      if (typeof closeHandler === 'function') {
        closeHandler();
        e.stopPropagation();
      }
    }
  };

  const onDownloadClickedHandler = (): void => {
    const contentUrl = getContentUrl(content.id);

    if (window === undefined) {
      return;
    }

    window.open(contentUrl, '__blank');
  };

  return (
    <div className={hmvStyle.contentDisplayContainer} onClick={onBackgroundClicked}>
      {isAdmin === true && isVideoByExtension(content.extension) && (
        <div className={hmvStyle.videoThumbnailAction}>
          <button
            type="button"
            disabled={!frameReady || pending}
            onClick={() => {
              void updateThumbnail();
            }}
          >
            Use current frame as thumbnail
          </button>
          <span role="status">{message}</span>
          {error && <span role="alert">{error}</span>}
        </div>
      )}
      <div className={hmvStyle.operationsBlock}>
        <div onClick={onDownloadClickedHandler}>&#8615;</div>
        <div onClick={closeHandler}>X</div>
      </div>
      <div className={`${hmvStyle.navigationArea} ${hmvStyle.previousContainer}`} onClick={previousHandler}>
        <div>&lt;</div>
      </div>
      <div className={hmvStyle.contentWrapper}>{getContentElement(content)}</div>
      <div className={`${hmvStyle.navigationArea} ${hmvStyle.nextContainer}`} onClick={nextHandler}>
        <div>&gt;</div>
      </div>
    </div>
  );
};

export default ContentDisplay;
