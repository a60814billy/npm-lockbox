# npm-lockbox

## **Active Development In Progress**

Manage and restrict npm dependencies with specific versions or dates.

## Introduction

When maintaining some legacy projects, dependency issues often arise. 
Ideally, we'd like to keep the dependencies at the version they were when the project was created. 
However, npm automatically resolves to the latest version. 

The purpose of `npm-lockbox` is to address this issue. 
It allows you to specify a date, directing npm to only download dependency versions available up to that date.

Package metadata and project rules are cached in a local SQLite database. Set `NPM_LB_DB_PATH` to choose a database file; otherwise the server uses `npm-lockbox.sqlite` in the current working directory. Package tarballs are cached under `mirror/` by default, or under `NPM_LB_TARBALL_CACHE_DIR` when set.

## How to use

Create a project, set its lock rules, then point npm at the project registry branch.

```
curl -X POST http://localhost:8080/api/v1/projects \
  -H 'content-type: application/json' \
  -d '{"name":"legacy-app","lockDate":"2020-12-31T00:00:00.000Z"}'

curl -X PUT http://localhost:8080/api/v1/projects/legacy-app/packages/express/max-version \
  -H 'content-type: application/json' \
  -d '{"maxVersion":"4.0.0"}'

npm config set registry http://localhost:8080/-/legacy-app/
```

When you run `npm install`, metadata and tarball requests go through that project branch. The project lock date applies to all packages, and package-specific maximum versions further restrict the allowed versions.

## Docker

Build and run the production server with persistent SQLite and tarball cache data:

```
docker compose up --build
```

The container listens on port `8080`, stores project/cache data under the `npm-lockbox-data` volume, and exposes the SPA at `http://localhost:8080/ui/projects`.
