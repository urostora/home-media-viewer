#!/bin/bash

datetime=`date +%Y%m%d_%H%M%S`
backupfilename=file_backup_$datetime.tar.gz
owneruser=shareuser
ownergroup=hddusers

# clear old backup
docker run --rm -v docker_home-media-storage:/hmv -v ./../files:/backup ubuntu bash -c "cd /hmv && tar -uvf /backup/$backupfilename *"


#set backup file rights
cd ../files
chown $owneruser:$ownergroup $backupfilename


