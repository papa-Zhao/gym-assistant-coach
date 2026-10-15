from fastapi import FastAPI

app = FastAPI(title="Gym Assistant Coach bot")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "bot"}
