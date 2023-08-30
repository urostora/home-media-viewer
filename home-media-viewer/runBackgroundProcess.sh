cd /home/node/app

now=`date '+%F %T'`
echo "[$now] Starting HMV background process"

wget "localhost:$PORT/api/process/updateMetadata?token=$PROCESS_TOKEN" -O /dev/null > /dev/null

# npx ts-node -r tsconfig-paths/register ./src/backgroundProcesses/updateMetadata.ts > /dev/null

now=`date '+%F %T'`
echo "[$now]    ... HMV background process finished"