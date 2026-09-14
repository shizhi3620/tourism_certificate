# Tourism

Standalone Node.js 22 starter for the tourism project.

## Development

```bash
npm install
npm run check
npm test
npm start
```

The server listens on `PORT` (default `3000`) and exposes:

- `GET /health` - returns the service health status.
- `GET /` - returns the project name and available routes.

Copy `.env.example` to `.env` when local configuration is needed. Do not
commit credentials or local runtime data.

## Structure

- `src/server.mjs` - HTTP server and request routing.
- `test/server.test.mjs` - smoke tests for the public HTTP contract.
- `CONTEXT.md` - initial domain vocabulary and boundaries.
