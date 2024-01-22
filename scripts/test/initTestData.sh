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

echo -e "\nInit test suite (app url: ${APP_URL})"

echo -e "\nLogin with use ${ADMIN_EMAIL}"

# login
curl -X POST -S -H 'Content-Type: application/json' -d '{"email": "'${ADMIN_EMAIL}'", "password": "'${ADMIN_PASSWORD}'"}' -c ${COOKIES_FILE} ${APP_URL}/api/login

# check if cookies file exists
if [ ! -f ${COOKIES_FILE} ]
then
    # ERROR
    echo -e "\n${RED}ERROR${NC}: Login cookies could not be saved"
    exit 1
fi

echo -e "\n${GREEN}Login succeed${NC}"

# add 'album01'
echo -e "\nAdd album 'album01'"
curl -X PUT -S -H 'Content-Type: application/json' -d '{"path": "album01"}' -b ${COOKIES_FILE} ${APP_URL}/api/album

# add 'album02'
echo -e "\nAdd album 'album02'"
curl -X PUT -S -H 'Content-Type: application/json' -d '{"path": "album02"}' -b ${COOKIES_FILE} ${APP_URL}/api/album

# add 'guest@guest.com' non-admin user
echo -e "\nAdd user 'guest@guest.com'"
curl -X PUT -S -H 'Content-Type: application/json' -d '{"name": "guest", "email": "guest@guest.com", "password": "Guest+P4ssw0rd+Test" }' -b ${COOKIES_FILE} ${APP_URL}/api/user


# call data processing API 3 times to index all content
echo -e "\nRun background process 3 times\n"
curl -S ${BACKGROND_URL}/api/process/updateMetadata?token=${PROCESS_TOKEN}
curl -S ${BACKGROND_URL}/api/process/updateMetadata?token=${PROCESS_TOKEN}
curl -S ${BACKGROND_URL}/api/process/updateMetadata?token=${PROCESS_TOKEN}

if [ -f $COOKIES_FILE ]
then
    rm $COOKIES_FILE
fi

echo -e "\n${GREEN}Initialization script finished${NC}\n"
