# Brackets Manager Server

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

1. **Prepare the project directory**

    Create a folder for the project and navigate into it:

    ```bash
    mkdir brackets-manager-server && cd brackets-manager-server
    ```

2. **Create the `docker-compose.yml` file**

    Copy the following content into a file named `docker-compose.yml` or [download it](docker-compose.yml):

    ```yaml
    services:
    tournament-server:
        image: ghcr.io/juniornff/brackets-manager-server:latest
        container_name: brackets-manager-api
        restart: unless-stopped
        ports:
        - "3000:3000"
        volumes:
        - ./data:/app/data
        environment:
        - API_KEY=${API_KEY}
        - DATA_FILE=db.json
        - VERBOSE=false
    ```

3. **Configuration and environment variables (optional but recommended)**

   Modify the `volumes` section to mount a different host directory to store the database.

   The application uses this enviroment varibles:
   - `API_KEY`: You can specify an API key to secure the connection to the API server and the application tha consume it. Prevent unwanted third-party connections; this can be omitted if desired.
   - `DATA_FILE`: Determine the name of the JSON file.
   - `VERBOSE`: Activates/deactivates the library's descriptive mode.

   You can define these variables in a `.env` file placed in the same directory as your `docker-compose.yml`.  
   

4. **Start the container**

   ```bash
   docker-compose up -d
   ```

   This will build the image (if not already built) and start the container on port 3000. The database file `db.json` will be persisted in the `data/` directory (mounted as a volume).

5. **Verify the server is running**

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
docker run -d \
  --name brackets-manager-api \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e API_KEY=MyAPIKey \
  -e DATA_FILE=db.json \
  -e VERBOSE=false \
  --restart unless-stopped \
  ghcr.io/juniornff/brackets-manager-server:latest
```

## Running with Node.js (optional)

If you prefer to run the server directly on your machine without Docker, follow these steps:

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set environment variables (optional)**

   ```bash
   export API_KEY=MyAPIKey
   export DATA_FILE=my_db.json
   export VERBOSE=false
   ```

3. **Start the server**

   ```bash
   npm start
   ```
   Or directly with Node:
   ```bash
   node tournament-server.js
   ```

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.