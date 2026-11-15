> **ARCHIVED, DO NOT FOLLOW.**
> Written ~Sept 2025. Describes a Render + Railway deployment and Google OAuth,
> neither of which the code uses. Kept for history only.
> Current setup: [ONBOARDING.md](../../ONBOARDING.md).

---

## Build and locally running the application

### Prerequisites

Before building the application, ensure to have the following have been installed:

- Node.js (v18 or higher)
- npm or yarn (this application is run through npm)
- Docker and docker-compose
- MySQL

### Environment Setup

#### Clone the Repo:

```bash
git clone <https://github.com/sagashrimproll/NUHire.git >
cd panployer
```

#### Imstall the dependencies

For the frontend:

```bash
cd frontend
npm install
```

For the backend:

```bash
cd ../api
npm install
```

#### Environment Variables

Create a .env file in your Root and API and Frontend directories

in the root level include your db information:

```
MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_DATABASE=db_name

API_PORT=5001
DB_HOST=your_host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=db_name
```

In your env file of the frontend directory include:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:5001
```

In your api .env file include:

```
GOOGLE_CLIENT_ID=your_google_clientId
GOOGLE_CLIENT_SECRET=your_client_secret
SESSION_SECRET=your_secret_key


REACT_APP_FRONT_URL=http://localhost:3000
```

For Google Client Id and Session secret keys, the student recreating this would have to go into Google OAuth and set up their OAuth to get credentials from Google API.

### Using Docker

```bash
docker-compose up --build
```

### If Running manually (without docker):

```bash
cd api
node server.js
```

in the frontend:

```bash
cd frontend
npm run dev
```

Database Setup:
Import the provided SQL schema file to setup your MySQL database (preferred to use MySql workbench for visualization and setup of the db)

The database configuration should match the environment variables in the local MySQL setup.
