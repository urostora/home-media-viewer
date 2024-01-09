#!/bin/bash

#################
# Initiates data in test environment
# Prerequest: run test app container
#################

COOKIES_FILE=cookies.txt

RED='\033[0;31m' # RED
NC='\033[0m' # No Color
GREEN='\033[0;32m' # GREEN

# delete old cookies file
if [ -f $COOKIES_FILE ]
then
    rm cookies.txt
fi

# login
curl -X POST -H 'Content-Type: application/json' -d '{"email": "'${ADMIN_EMAIL}'", "password": "'${ADMIN_PASSWORD}'"}' -c ${COOKIES_FILE} ${APP_URL}/api/login

# check if cookies file exists
if [ ! -f ${COOKIES_FILE} ]
then
    # ERROR
    echo -e "\n${RED}ERROR${NC}: Login cookies could not be saved"
    exit 1
fi

# add 'album01'
echo -e "\nAdd 'album01'"
curl -X PUT -H 'Content-Type: application/json' -d '{"path": "album01"}' -b ${COOKIES_FILE} ${APP_URL}/api/album

# add 'album02'
echo -e "\nAdd 'album02'"
curl -X PUT -H 'Content-Type: application/json' -d '{"path": "album02"}' -b ${COOKIES_FILE} ${APP_URL}/api/album

# call data processing API 3 times to index all content
echo -e "\nRun background process 3 times\n"
curl ${BACKGROND_URL}/api/process/updateMetadata?token=${PROCESS_TOKEN}
echo -e "\n"
curl ${BACKGROND_URL}/api/process/updateMetadata?token=${PROCESS_TOKEN}
echo -e "\n"
curl ${BACKGROND_URL}/api/process/updateMetadata?token=${PROCESS_TOKEN}

if [ -f $COOKIES_FILE ]
then
    rm $COOKIES_FILE
fi

echo -e "\n${GREEN}Initialization script finished${NC}\n"