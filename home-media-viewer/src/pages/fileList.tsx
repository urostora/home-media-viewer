import Image from 'next/image';
import { useState, useEffect } from 'react'

export default function FileList() {
    const [data, setData] = useState(null)
    const [isLoading, setLoading] = useState(false)

    useEffect(() => {
        setLoading(true)

        const args: RequestInit = {
            method: 'post',
            body: JSON.stringify({
                status: 'Active',
	            metadataStatus: 'Processed',
            }),
        };

        fetch('/api/file', args)
            .then((res) => res.json())
            .then((data) => {
                setData(data)
                setLoading(false)
            });
    }, []);

    if (isLoading) return <p>Loading...</p>
    if (!data) return <p>No files available</p>

    console.log(data);

    if (data?.ok !== true || !Array.isArray(data?.data)) {
        return <p>No files available</p>;
    }

    const fileElements = data.data.map(fileData => {
        return <li key={fileData.id}>{fileData.name}<Image alt={fileData.name} width={200} height={150} src={`data:image/jpeg;base64,${fileData.thumbnail}`} /></li>;
    });

    return (<div>
        <ul>
            {fileElements}
        </ul>
    </div>);
}