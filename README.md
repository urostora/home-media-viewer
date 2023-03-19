# Home media server

Docker-based project provides web access to media files in our storage.

## Usage

### Run developer environment

`docker-compose up -d`

[Web access](http://localhost:23000/)
[API access](http://localhost:23000/api/hello)

### Run node commands

Node version
`docker-compose run --rm dependencies bash -c "node --version"`

Install npm packages
`docker-compose run --rm dependencies bash -c "npm install"`

Prisma commands
`docker-compose run --rm dependencies bash -c "npx prisma ...."`

`docker-compose run --rm dependencies bash -c "npx prisma migrate dev --name=init"`

`docker-compose run --rm dependencies bash -c "npx prisma db push"`
