import { useContext, useState } from "react";
import { Map, Marker } from "pigeon-maps"

import { AuthContext } from '@/components/auth/authContext';
import { MetaType } from "@/utils/metaUtils";
import { apiFileUpdateMetadata } from "@/utils/frontend/dataSource/file";

import type { FileMetaUpdateType, FileResultType } from "@/types/api/fileTypes";

import style from '@/styles/hmv.module.scss';


interface LocationMetadataDisplayProps {
    file: FileResultType;
}

interface Location {
    latitude: number;
    longitude: number;
}

const DEFAULT_LOCATION: Location = {
    latitude: 47.4899,
    longitude: 19.1173,
};

const DEFAULT_ZOOM = 16;

const getFileLocation = (file: FileResultType): null | Location => {
    const locationMeta = file.metas.find(m => m.metaKey === MetaType.GpsCoordinates);

    if (
        locationMeta === null
        || typeof locationMeta?.latitude !== 'number'
        || typeof locationMeta?.longitude !== 'number'
    ) {
        return null;
    }

    return { latitude: locationMeta.latitude, longitude: locationMeta.longitude };
}

const LocationMetadataDisplay: React.FC<LocationMetadataDisplayProps> = (props: LocationMetadataDisplayProps): React.ReactElement => {
    const { file } = props;
    const authContext = useContext(AuthContext);

    const fileLocation = getFileLocation(file);

    const [ currentLocation, setCurrentLocation ] = useState<Location | null>(fileLocation);
    const [ currentZoom, setCurrentZoom ] = useState<number>(DEFAULT_ZOOM);
    const [ isLocationChanged, setIsLocationChanged ] = useState<boolean>(false);
    const [ isLocationChangeInProgress, setIsLocationChangeInProgress ] = useState<boolean>(false);
    const [ error, setError ] = useState<string | null>(null);
    
    const isAdmin = authContext.isAdmin === true;

    const setLocationButtonHandler = (): void => {
        setCurrentLocation(DEFAULT_LOCATION);
    };

    const mapClickedHandler = ({ event, latLng, pixel }: {event: MouseEvent, latLng: [number, number], pixel: [number, number] }): void => {
        event.stopImmediatePropagation();

        if (!isAdmin) {
            return;
        }

        setCurrentLocation({ latitude: latLng[0], longitude: latLng[1] });
        setIsLocationChanged(true);
    };

    const resetLocationHandler = (): void => {
        setCurrentLocation(fileLocation);
        setIsLocationChanged(false);
    };

    const zoomInHandler = (): void => {
        setCurrentZoom(zoom => ++zoom);
    };

    const zoomOutHandler = (): void => {
        setCurrentZoom(zoom => zoom <= 1 ? zoom : --zoom);
    };

    const saveLocationHandler = (): void => {
        if (currentLocation === null) {
            return;
        }

        const data: FileMetaUpdateType = {
            key: MetaType.GpsCoordinates,
            type: 'Location',
            value: {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
            }
        };

        setIsLocationChangeInProgress(true);
        setError(null);

        apiFileUpdateMetadata(file.id, data)
            .then(() => {
                setIsLocationChanged(false);
                setError(null);
            })
            .catch((e) => {
                setError(`${e}`);
            })
            .finally(() => {
                setIsLocationChangeInProgress(false);
            });
    };

    if (currentLocation === null) {
        // file location not set, show only a button (admin) or an info box
        return (<div className={style.locationMetadataDisplay} >
            {isAdmin
                ? <button className={style.roundBorderedButtonElement} onClick={setLocationButtonHandler}>Content has no location - Set it</button>
                : <div className={style.infoBox}>{'Media content has no location metadata'}</div>}
        </div>);
    }

    const zoomControls = (<div key="zoom" className={`${style.actionsContainer} ${style.zoomContainer}`}>
        <button className={style.roundBorderedButtonElement} onClick={zoomOutHandler}>-</button>
        <span>ZOOM</span>
        <button className={style.roundBorderedButtonElement} onClick={zoomInHandler}>+</button>
    </div>);

    const actions = isAdmin && isLocationChanged
        ? (<div key="actions" className={style.actionsContainer}>
            <button className={style.roundBorderedButtonElement} onClick={saveLocationHandler} disabled={isLocationChangeInProgress}>{isLocationChangeInProgress ? 'Update in progress' : 'Change location to current marker'}</button>
            {fileLocation !== null ? <button className={style.roundBorderedButtonElement} onClick={resetLocationHandler}>Reset location</button> : null}
        </div>)
        : null;

    const errorContainer = error === null
        ? null
        : <div key="error" className={style.errorContainer}>{error}</div>;

    return (<div className={`${style.locationMetadataDisplay} ${style.isOpen}`}>
        {zoomControls}
        <div key="map" className={style.mapContainer}>
            <Map defaultCenter={[ currentLocation.latitude, currentLocation.longitude]} defaultZoom={DEFAULT_ZOOM} zoom={currentZoom} onClick={mapClickedHandler}>
                <Marker anchor={[ currentLocation.latitude, currentLocation.longitude]} />
            </Map>
        </div>
        {actions}
        {errorContainer}
    </div>);
}

export default LocationMetadataDisplay;