from fastapi.testclient import TestClient
import pytest

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint_reports_runtime_metadata(client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "database" in payload


def test_info_endpoint_reports_capabilities(client) -> None:
    response = client.get("/api/info")
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Sports Motion Analysis API"
    assert "pose-analysis" in payload["features"]


def test_session_endpoints_support_header_based_user_context(client) -> None:
    headers = {"X-Clerk-User-Id": "pytest-user"}
    create_response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "activity": "squat",
            "score": 88,
            "ml_label": "Good Squat",
            "consistency": 91.2,
            "risk": "Low",
            "power": 420,
        },
    )
    assert create_response.status_code == 200

    list_response = client.get("/api/sessions?limit=1", headers=headers)
    assert list_response.status_code == 200
    payload = list_response.json()
    assert len(payload) == 1
    assert payload[0]["activity"] == "squat"
