import pytest
import pytest_asyncio

from backend.app.db.users import UsersDB


@pytest_asyncio.fixture
async def users_db(tmp_path):
    db = UsersDB(tmp_path / "test_users.db")
    await db.connect()
    await db.init_schema()
    yield db
    await db.close()


@pytest.mark.asyncio
async def test_create_session(users_db):
    session = await users_db.create_session()
    assert "id" in session
    assert "created_at" in session


@pytest.mark.asyncio
async def test_get_session(users_db):
    created = await users_db.create_session()
    fetched = await users_db.get_session(created["id"])
    assert fetched is not None
    assert fetched["id"] == created["id"]


@pytest.mark.asyncio
async def test_save_and_get_messages(users_db):
    session = await users_db.create_session()
    await users_db.save_message(session["id"], "user", "hello")
    await users_db.save_message(session["id"], "assistant", "hi")
    messages = await users_db.get_messages(session["id"])
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_create_import(users_db):
    session = await users_db.create_session()
    imp = await users_db.create_import(session["id"], "/tmp/test.txt", "23andme")
    assert imp["status"] == "pending"


@pytest.mark.asyncio
async def test_update_import(users_db):
    session = await users_db.create_session()
    imp = await users_db.create_import(session["id"], "/tmp/test.txt", "23andme")
    await users_db.update_import(imp["id"], status="done", variant_count=960614)
    updated = await users_db.get_import(imp["id"])
    assert updated["status"] == "done"
    assert updated["variant_count"] == 960614
