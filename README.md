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

   This will build the image (if not already built) and start the container on port 3000. The database file `db.json` will be persisted in the `data/` directory (mounted as a volume).

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
docker run -p 3000:3000 -v $(pwd)/data:/app/data -e DATA_FILE=data/db.json brackets-manager-server
```

## Configuration

If you need to run the server on a different host port (e.g., 8080), edit the `ports` section in `docker-compose.yml`

The server uses the environment variable `DATA_FILE` to determine where to store the JSON database. By default, in the provided `docker-compose.yml`, it is set to `data/db.json` and the `./data` directory is mounted as a volume.

If you want to change the location or filename:

- Modify the `volumes` section to mount a different host directory.
- Update the `DATA_FILE` environment variable accordingly (the path should be relative to the container's working directory, `/app`).

## Running with Node.js (optional)

If you prefer to run the server directly on your machine without Docker, follow these steps:

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Prepare the database directory**

   By default, the server stores the database in `data/db.json`. Create the directory if it doesn't exist:

   ```bash
   mkdir -p data
   ```

3. **Set environment variables (optional)**

   You can change the database file location by setting the `DATA_FILE` environment variable. For example, to use `./my_db.json`:

   ```bash
   export DATA_FILE=my_db.json
   ```

   If not set, it defaults to `data/db.json`.

4. **Start the server**

   ```bash
   npm start
   ```
   Or directly with Node:
   ```bash
   node tournament-server.js
   ```

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.