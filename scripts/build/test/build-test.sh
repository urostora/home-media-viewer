#!/bin/bash

#
# Parameters:
#

# get parameters
tag=''
commit=''
branch=''
help=0

while getopts t:c:b:h flag
do
    case "${flag}" in
        t) tag=${OPTARG};;
        c) commit=${OPTARG};;
        b) branch=${OPTARG};;
        h) help=1;;
    esac
done

if [ -z $tag ] && [ -z $commit ] && [ -z $branch ]
then
	help=1
fi

# show help if necessary
if [ $help -eq 1 ]
then
	echo "Build HMV Docker images"
	exit 0
fi


# store git access token
gittoken=$(<"../.accessToken")


################
# START PROCESS
################

# remove previous artifacts
#rm -r home-media-viewer

# clone repository
#git clone https://$gittoken@github.com/urostora/home-media-viewer.git

cd home-media-viewer
git fetch --all --tags

# checkout by tag, commit or branch
if [ ! -z $tag ]
then
	echo "Checkout TAG $tag"
	git checkout --detach tags/$tag
elif [ ! -z $commit ]
then
	echo "Checkout commit $commit"
	git checkout --detach $commit
elif [ ! -z $branch ]
then
	echo "Checkout branch $branch"
	git switch $branch
fi

# check if error occured
if [ $? -ne 0 ]; then
	echo Error while checking out the proper version of code
	exit 1
fi

# build containers
docker-compose --file docker-compose-test.yml --env-file .env-test build

# check if error occured
if [ $? -ne 0 ]; then
	echo Error while building test images
	exit 1
fi

# add tags
if [ ! -z $tag ]
then
	echo "Add tag $tag"
	docker image tag urostora/home-media-viewer/app:latest urostora/home-media-viewer/app-test:$tag
	docker image tag urostora/home-media-viewer/migration:latest urostora/home-media-viewer/migration-test:$tag
fi

# start containers
docker-compose --file docker-compose-test.yml --env-file .env-test up -d

# database setup
docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma migrate reset --force"

# prepare test data
docker-compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "./scripts/initTestData.sh"

# run test suite
docker-compose --file docker-compose-test.yml --env-file .env-test  run --rm testrunner bash -c "npm run test"
