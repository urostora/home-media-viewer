import { actions, queueName, rabbitConnection } from "@/utils/jobQueue/basics";
import { File } from "@prisma/client";
import amqp from "amqplib";

export const addFileToMetadataProcessingQueue = async (file: File): Promise<void> => {
    let connection;

    try {
        connection = await amqp.connect(rabbitConnection.connectionString);
        const channel = await connection.createChannel();

        await channel.assertQueue(queueName.metaProcessing, { durable: true });
        channel.sendToQueue(
            queueName.metaProcessing,
            Buffer.from(JSON.stringify({ action: actions.processMetadata, id: file.id })),
            { priority: 50 });
        
        console.log(` [MB] Add file metadata processing: ${file.id}`);

        await channel.close();
    } catch (err) {
        console.warn(err);
    } finally {
        if (connection) await connection.close();
    }
}