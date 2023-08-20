cd /home/node/app

now=`date '+%F %T'`
echo "[$now] Starting HMV background process"

npx ts-node -r tsconfig-paths/register ./src/backgroundProcesses/updateMetadata.ts > /dev/null

now=`date '+%F %T'`
echo "[$now]    ... HMV background process finished"