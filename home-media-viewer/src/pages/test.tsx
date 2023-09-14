import { useState, useEffect } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';

const mapStartingPoint = {
    lat: 47.498,
    lng: 19.040,
};

const TestPage = () => {
    const [ isClientSide, setIsClientSide] = useState<boolean>(false);

    useEffect(() => {
        setIsClientSide(true);
    }, []);

    if (!isClientSide) {
        return <></>;
    }

    return <MapContainer
        center={mapStartingPoint}
        zoom={10}
    >
        <TileLayer
            attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
    </MapContainer>;
  };
  
  export default TestPage;