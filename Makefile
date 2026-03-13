.PHONY: install install-dev run test docker

install:
	python3 -m venv .venv && . .venv/bin/activate && pip install -r backend/requirements.txt

install-dev:
	python3 -m venv .venv && . .venv/bin/activate && pip install -r backend/requirements-dev.txt

run:
	uvicorn app.main:app --app-dir backend --reload

test:
	python3 -m pytest

docker:
	docker compose up --build
