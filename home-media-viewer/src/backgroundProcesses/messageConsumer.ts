import { loadMetadataById } from "@/utils/fileHelper";
import { actions, queueName, rabbitConnection } from "@/utils/jobQueue/basics";
import amqp from "amqplib";

const messageConsumer = (() => {
    let connection: undefined | amqp.Connection = undefined;
    let channel: undefined | amqp.Channel = undefined;

    const init = async () => {
        try {
            
            console.log(`[MessageConsumer] connecting to Rabbitmq at ${rabbitConnection.connectionString}...`);
            connection = await amqp.connect(rabbitConnection.connectionString);
            console.log(`[MessageConsumer] connected to Rabbitmq at ${rabbitConnection.connectionString}`);

            channel = await connection.createChannel(); 
            console.log(`[MessageConsumer] Rabbitmq channel created`);

            process.once("SIGINT", async () => {
                if (channel) {
                    await channel.close();
                }

                if (connection) {
                    await connection.close();
                }
            });

            await channel.assertQueue(queueName.metaProcessing, { durable: true });
            console.log(`[MessageConsumer] Rabbitmq queue asserted with name ${queueName.metaProcessing}`);
            
            await channel.consume(
                queueName.metaProcessing,
                async (message: amqp.ConsumeMessage | null) => {
                    try {
                        if (typeof message?.content?.toString === 'function') {
                            const parsedData = JSON.parse(message.content.toString());

                            if (typeof parsedData !== 'object') {
                                console.log("[MessageConsumer] Could not parse data");
                                return;
                            }

                            console.log(
                                "[MessageConsumer] Received metadata processing",
                                parsedData,
                            );

                            if (parsedData?.action === actions.processMetadata && typeof parsedData?.id === 'string') {
                                try {
                                    await loadMetadataById(parsedData?.id);
                                } catch (e) {
                                    console.error(`Error while loading metadata for file ${parsedData?.id}: ${e}`);
                                }
                            }
                        } else {
                            console.log("[MessageConsumer] Could not stringify data");
                        }
                    } finally {
                        if (message != null) {
                            channel?.ack(message);
                        }
                    }
                },
                { noAck: false }
              );

            console.log(`[MessageConsumer] Rabbitmq consumer process added`);
            
            // await channel.close();
        } catch (err) {
            console.warn(err);
        } finally {
            // if (connection) await connection.close();
        }
    };

    return {
        init,
    }
})();

export default messageConsumer;