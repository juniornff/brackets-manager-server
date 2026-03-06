# brackets-manager-server

A simple RESTful API for the [brackets-manager.js](https://github.com/Drarig29/brackets-manager.js) library by Drarig29. This server provides an HTTP interface to manage tournaments, stages, matches, participants, and seeding operations, using `brackets-json-db` as the storage backend.

The API is designed to be used as a backend service for tournament management applications. Only a subset of the library’s functions are exposed – specifically those required by the [ssbu-matchups-tracker](https://github.com/juniornff/ssbu-matchups-tracker) project. A tool for tracking Super Smash Bros. Ultimate matchups and tournament results.

## Implemented Features

- **Tournaments / Stages** – create, list, retrieve, and delete tournaments (stages)
- **Matches** – list matches of a stage, update matches, update child games (Best‑of‑X), reset match results, retrieve current playable matches
- **Seeding** – get, update, confirm, and reset the seeding of a stage
- **Ordering** – update the ordering of a stage or a round
- **Participants** – CRUD operations for participants (create, read, update, delete, list, delete all)
- **Standings** – obtain final standings for a tournament (with custom ranking formula for round‑robin)
- **Utilities** – health check, reset the entire database

Not all functions of `brackets-manager.js` are implemented; only the endpoints needed for the `ssbu-matchups-tracker` are provided.

## Technologies

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [brackets-manager.js](https://github.com/Drarig29/brackets-manager.js) – tournament management core
- [brackets-json-db](https://github.com/Drarig29/brackets-storage) – JSON file storage
- [Docker](https://www.docker.com/) – containerisation

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (if you use the Docker method)
- Alternatively, [Node.js](https://nodejs.org/) (v18 or later) to run without Docker

## Deployment with Docker

The easiest way to run the server is with Docker Compose.

1. **Clone the repository**

   ```bash
   git clone https://github.com/juniornff/brackets-manager-server.git
   cd brackets-manager-server
   ```

2. **Start the container**

   ```bash
   docker-compose up -d
   ```

   This will build the image (if not already built) and start the container on port 3000. The database file `db.json` will be persisted in the current directory (mounted as a volume).

3. **Verify the server is running**

   ```bash
   curl http://localhost:3000/health
   ```

   You should receive a JSON response with status `OK`.

    To stop the container:

    ```bash
    docker-compose down
    ```

### Building the image manually (optional)

If you prefer to build and run the image without Compose:

```bash
docker build -t brackets-manager-server .
docker run -p 3000:3000 -v $(pwd)/db.json:/app/db.json brackets-manager-server
```

## Configuration

The server uses the following environment variables (optional):

- `PORT` – the port on which the server listens (default: `3000`)

The database is stored in `db.json` in the working directory. If the file does not exist, it will be created automatically.


## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.