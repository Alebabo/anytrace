# Welcome to your Lovable project

## Local development

Copy the example env file and customize as needed:

```bash
cp .env.example .env.local
```

The frontend reads `VITE_API_BASE_URL` to talk to the FastAPI backend. By
default it points at the public ngrok tunnel. Override in `.env.local` to
target a different host (e.g. `http://localhost:8000`).
