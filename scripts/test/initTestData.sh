#!/bin/bash

#################
# Initiates data in test environment
# Prerequest: run test app container
#################

# delete old cookies file
rm cookies.txt

# login
curl -X POST $APP_URL/api/login -H 'Content-Type: application/json' -d '{"email": "'$ADMIN_EMAIL'", "password": "'$ADMIN_PASSWORD'"}' -c cookies.txt

# add 'album01'
curl -X PUT $APP_URL/api/album -H 'Content-Type: application/json' -d '{"path": "album01"}' -b cookies.txt

# add 'album02'
curl -X PUT $APP_URL/api/album -H 'Content-Type: application/json' -d '{"path": "album02"}' -b cookies.txt

# call data processing API 3 times to index all content
curl $BACKGROND_URL/api/process/updateMetadata?token=$PROCESS_TOKEN
curl $BACKGROND_URL/api/process/updateMetadata?token=$PROCESS_TOKEN
curl $BACKGROND_URL/api/process/updateMetadata?token=$PROCESS_TOKEN

rm cookies.txt