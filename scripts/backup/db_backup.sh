#!/bin/bash

containername=home-media-viewer-db
datetime=`date +%Y%m%d_%H%M%S`
backupfilename=db_backup_$datetime.tar.gz
owneruser=shareuser
ownergroup=hddusers

# clear old backup
docker exec $containername bash -c "rm -r /backup"

# create backup
docker exec $containername bash -c 'mariabackup --backup --target-dir=/backup --user root --password=${MARIADB_ROOT_PASSWORD}'

# compress backup
docker exec $containername bash -c "tar -cvzf /backup/db_backup.tar.gz /backup/*"

# copy backup to server
docker cp $containername:/backup/db_backup.tar.gz ./$backupfilename

# clear backup directory on container
docker exec $containername bash -c "rm -r /backup"

#set backup file rights
chown $owneruser:$ownergroup $backupfilename

# move backup to backup directory
mv $backupfilename ./../backup/$backupfilename

cd ../backup

ls -tp | grep -v '/$' | tail -n +20 | xargs -d '\n' -r rm --


