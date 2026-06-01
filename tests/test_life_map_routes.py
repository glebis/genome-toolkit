from fastapi.testclient import TestClient

from backend.app.main import app, ALL_VIEWS

client = TestClient(app)


def test_life_tables_endpoint_returns_countries():
    r = client.get("/api/life-map/life-tables")
    assert r.status_code == 200
    body = r.json()
    assert "retrieved" in body and "countries" in body
    # the user's real case: Germany + Russia present
    assert "DE" in body["countries"]
    assert "RU" in body["countries"]
    assert body["countries"]["DE"]["ex_by_age"]["male"]["38"] > 0


def test_life_modifiers_config_served():
    r = client.get("/api/config/life-modifiers")
    assert r.status_code == 200
    mods = r.json()["modifiers"]
    cats = {m["category"] for m in mods}
    assert {"stress", "mental-health", "family-history"} <= cats
    # mental-health items must be weak evidence (never produce a number)
    mh = [m for m in mods if m["category"] == "mental-health"]
    assert mh and all(m["evidence"] == "weak" for m in mh)


def test_life_map_view_registered():
    assert "life-map" in ALL_VIEWS
