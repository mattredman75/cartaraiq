"""Tests for list sharing endpoints in backend/routers/lists.py."""

import uuid
import pytest
from backend.tests.conftest import auth_headers, make_item, make_list, make_user
from backend.models.list_share import ListShare


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_list_share(db, list_id: str, owner_id: str, *, status: str = "pending", shared_with_id=None) -> ListShare:
    """Create a ListShare row directly (bypasses the invite endpoint)."""
    share = ListShare(
        list_id=list_id,
        owner_id=owner_id,
        invite_token=str(uuid.uuid4()),
        status=status,
        shared_with_id=shared_with_id,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


# ── Test Classes ──────────────────────────────────────────────────────────────

class TestCreateInvite:
    def test_owner_gets_invite_url(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        resp = client.post(f"/lists/groups/{lst.id}/invite", headers=auth_headers(user))
        assert resp.status_code == 201
        data = resp.json()
        assert "invite_url" in data
        assert "cartaraiq.app/share/" in data["invite_url"]
        assert "share_id" in data

    def test_non_owner_cannot_invite(self, client, db):
        owner = make_user(db, email="owner@example.com")
        other = make_user(db, email="other@example.com")
        lst = make_list(db, owner.id)
        resp = client.post(f"/lists/groups/{lst.id}/invite", headers=auth_headers(other))
        assert resp.status_code == 404

    def test_unauthenticated_cannot_invite(self, client, db):
        owner = make_user(db)
        lst = make_list(db, owner.id)
        resp = client.post(f"/lists/groups/{lst.id}/invite")
        assert resp.status_code == 401

    def test_invite_nonexistent_list_404(self, client, db):
        user = make_user(db)
        resp = client.post("/lists/groups/nonexistent-id/invite", headers=auth_headers(user))
        assert resp.status_code == 404

    def test_multiple_invites_allowed(self, client, db):
        """Owner can create multiple invite links for the same list."""
        user = make_user(db)
        lst = make_list(db, user.id)
        r1 = client.post(f"/lists/groups/{lst.id}/invite", headers=auth_headers(user))
        r2 = client.post(f"/lists/groups/{lst.id}/invite", headers=auth_headers(user))
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["invite_url"] != r2.json()["invite_url"]


class TestAcceptInvite:
    def test_accept_invite_success(self, client, db):
        owner = make_user(db, email="owner@example.com")
        joiner = make_user(db, email="joiner@example.com")
        lst = make_list(db, owner.id, name="Shared Groceries")
        share = make_list_share(db, lst.id, owner.id)

        resp = client.post(
            f"/lists/share/accept/{share.invite_token}",
            headers=auth_headers(joiner),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["list_id"] == lst.id
        assert data["list_name"] == "Shared Groceries"

    def test_shared_list_appears_in_joiner_lists(self, client, db):
        owner = make_user(db, email="owner@example.com")
        joiner = make_user(db, email="joiner@example.com")
        lst = make_list(db, owner.id, name="Owners List")
        share = make_list_share(db, lst.id, owner.id)

        client.post(f"/lists/share/accept/{share.invite_token}", headers=auth_headers(joiner))

        resp = client.get("/lists/groups", headers=auth_headers(joiner))
        assert resp.status_code == 200
        names = [l["name"] for l in resp.json()]
        assert "Owners List" in names

    def test_accepted_list_has_owner_name(self, client, db):
        owner = make_user(db, email="owner@example.com", name="Alice")
        joiner = make_user(db, email="joiner@example.com")
        lst = make_list(db, owner.id, name="Alices List")
        share = make_list_share(db, lst.id, owner.id)

        client.post(f"/lists/share/accept/{share.invite_token}", headers=auth_headers(joiner))

        resp = client.get("/lists/groups", headers=auth_headers(joiner))
        shared = next(l for l in resp.json() if l["name"] == "Alices List")
        assert shared["is_shared"] is True
        assert shared["owner_name"] == "Alice"

    def test_cannot_accept_own_invite(self, client, db):
        owner = make_user(db)
        lst = make_list(db, owner.id)
        share = make_list_share(db, lst.id, owner.id)

        resp = client.post(
            f"/lists/share/accept/{share.invite_token}",
            headers=auth_headers(owner),
        )
        assert resp.status_code == 400

    def test_cannot_accept_twice(self, client, db):
        owner = make_user(db, email="owner@example.com")
        joiner = make_user(db, email="joiner@example.com")
        lst = make_list(db, owner.id)
        share = make_list_share(db, lst.id, owner.id)

        # First accept
        r1 = client.post(f"/lists/share/accept/{share.invite_token}", headers=auth_headers(joiner))
        assert r1.status_code == 200
        # Second accept — already accepted
        r2 = client.post(f"/lists/share/accept/{share.invite_token}", headers=auth_headers(joiner))
        assert r2.status_code == 409

    def test_cannot_accept_if_already_member(self, client, db):
        """A second invite link should be rejected if user already has accepted access."""
        owner = make_user(db, email="owner@example.com")
        joiner = make_user(db, email="joiner@example.com")
        lst = make_list(db, owner.id)
        # Create two separate invites
        share1 = make_list_share(db, lst.id, owner.id)
        share2 = make_list_share(db, lst.id, owner.id)

        client.post(f"/lists/share/accept/{share1.invite_token}", headers=auth_headers(joiner))
        # Accepting second invite should fail since user already has access
        r2 = client.post(f"/lists/share/accept/{share2.invite_token}", headers=auth_headers(joiner))
        assert r2.status_code == 409

    def test_invalid_token_404(self, client, db):
        user = make_user(db)
        resp = client.post("/lists/share/accept/nonexistent-token", headers=auth_headers(user))
        assert resp.status_code == 404


class TestGetShares:
    def test_owner_can_see_shares(self, client, db):
        owner = make_user(db, email="owner@example.com")
        joiner = make_user(db, email="joiner@example.com", name="Bob")
        lst = make_list(db, owner.id)
        share = make_list_share(db, lst.id, owner.id, status="accepted", shared_with_id=joiner.id)

        resp = client.get(f"/lists/groups/{lst.id}/shares", headers=auth_headers(owner))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == share.id
        assert data[0]["shared_with_name"] == "Bob"
        assert data[0]["status"] == "accepted"

    def test_pending_shares_visible_to_owner(self, client, db):
        owner = make_user(db)
        lst = make_list(db, owner.id)
        make_list_share(db, lst.id, owner.id, status="pending")

        resp = client.get(f"/lists/groups/{lst.id}/shares", headers=auth_headers(owner))
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["status"] == "pending"

    def test_non_owner_cannot_see_shares(self, client, db):
        owner = make_user(db, email="owner@example.com")
        other = make_user(db, email="other@example.com")
        lst = make_list(db, owner.id)

        resp = client.get(f"/lists/groups/{lst.id}/shares", headers=auth_headers(other))
        assert resp.status_code == 404

    def test_collaborator_cannot_see_shares(self, client, db):
        """Collaborators should not be able to enumerate the shares list."""
        owner = make_user(db, email="owner@example.com")
        collab = make_user(db, email="collab@example.com")
        lst = make_list(db, owner.id)
        make_list_share(db, lst.id, owner.id, status="accepted", shared_with_id=collab.id)

        resp = client.get(f"/lists/groups/{lst.id}/shares", headers=auth_headers(collab))
        assert resp.status_code == 404


class TestRemoveShare:
    def test_owner_can_remove_collaborator(self, client, db):
        owner = make_user(db, email="owner@example.com")
        collab = make_user(db, email="collab@example.com")
        lst = make_list(db, owner.id, name="Unique Shared List ABC")
        share = make_list_share(db, lst.id, owner.id, status="accepted", shared_with_id=collab.id)

        resp = client.delete(
            f"/lists/groups/{lst.id}/shares/{share.id}",
            headers=auth_headers(owner),
        )
        assert resp.status_code == 204

        # Confirm collaborator no longer sees the owner's list
        lists_resp = client.get("/lists/groups", headers=auth_headers(collab))
        ids = [l["id"] for l in lists_resp.json()]
        assert lst.id not in ids

    def test_owner_can_revoke_pending_invite(self, client, db):
        owner = make_user(db)
        lst = make_list(db, owner.id)
        share = make_list_share(db, lst.id, owner.id, status="pending")

        resp = client.delete(
            f"/lists/groups/{lst.id}/shares/{share.id}",
            headers=auth_headers(owner),
        )
        assert resp.status_code == 204

        # Token should now be invalid
        new_user = make_user(db, email="new@example.com")
        accept_resp = client.post(
            f"/lists/share/accept/{share.invite_token}",
            headers=auth_headers(new_user),
        )
        assert accept_resp.status_code == 404

    def test_non_owner_cannot_remove_share(self, client, db):
        owner = make_user(db, email="owner@example.com")
        other = make_user(db, email="other@example.com")
        lst = make_list(db, owner.id)
        share = make_list_share(db, lst.id, owner.id)

        resp = client.delete(
            f"/lists/groups/{lst.id}/shares/{share.id}",
            headers=auth_headers(other),
        )
        assert resp.status_code == 404

    def test_remove_nonexistent_share_404(self, client, db):
        owner = make_user(db)
        lst = make_list(db, owner.id)
        resp = client.delete(
            f"/lists/groups/{lst.id}/shares/nonexistent-share-id",
            headers=auth_headers(owner),
        )
        assert resp.status_code == 404


class TestCollaboratorAccess:
    def test_collaborator_can_see_items(self, client, db):
        owner = make_user(db, email="owner@example.com")
        collab = make_user(db, email="collab@example.com")
        lst = make_list(db, owner.id)
        make_item(db, owner.id, lst.id, name="Milk")
        make_list_share(db, lst.id, owner.id, status="accepted", shared_with_id=collab.id)

        resp = client.get(f"/lists?list_id={lst.id}", headers=auth_headers(collab))
        assert resp.status_code == 200
        names = [i["name"] for i in resp.json()]
        assert "Milk" in names

    def test_non_member_cannot_see_items(self, client, db):
        owner = make_user(db, email="owner@example.com")
        other = make_user(db, email="other@example.com")
        lst = make_list(db, owner.id)

        resp = client.get(f"/lists?list_id={lst.id}", headers=auth_headers(other))
        assert resp.status_code in (403, 404)

    def test_collaborator_can_add_item(self, client, db):
        owner = make_user(db, email="owner@example.com")
        collab = make_user(db, email="collab@example.com")
        lst = make_list(db, owner.id)
        make_list_share(db, lst.id, owner.id, status="accepted", shared_with_id=collab.id)

        resp = client.post(
            "/lists/items",
            json={"name": "Bread", "list_id": lst.id},
            headers=auth_headers(collab),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Bread"

    def test_collaborator_cannot_add_to_unshared_list(self, client, db):
        owner = make_user(db, email="owner@example.com")
        collab = make_user(db, email="collab@example.com")
        lst = make_list(db, owner.id)
        # No share created

        resp = client.post(
            "/lists/items",
            json={"name": "Eggs", "list_id": lst.id},
            headers=auth_headers(collab),
        )
        assert resp.status_code in (403, 404)

    def test_item_added_by_name_shown_for_other_user(self, client, db):
        """When a collaborator adds an item, the owner should see added_by_name."""
        owner = make_user(db, email="owner@example.com", name="Owner")
        collab = make_user(db, email="collab@example.com", name="Collab")
        lst = make_list(db, owner.id)
        make_list_share(db, lst.id, owner.id, status="accepted", shared_with_id=collab.id)
        # Add item as collaborator
        add_resp = client.post(
            "/lists/items",
            json={"name": "Eggs", "list_id": lst.id},
            headers=auth_headers(collab),
        )
        assert add_resp.status_code == 201

        # Owner fetches items — should see added_by_name for collab's item
        items_resp = client.get(f"/lists?list_id={lst.id}", headers=auth_headers(owner))
        items = items_resp.json()
        egg_item = next((i for i in items if i["name"] == "Eggs"), None)
        assert egg_item is not None
        assert egg_item["added_by_name"] == "Collab"

    def test_share_count_reflects_accepted_collabs(self, client, db):
        owner = make_user(db, email="owner@example.com")
        collab1 = make_user(db, email="c1@example.com")
        collab2 = make_user(db, email="c2@example.com")
        lst = make_list(db, owner.id)
        make_list_share(db, lst.id, owner.id, status="accepted", shared_with_id=collab1.id)
        make_list_share(db, lst.id, owner.id, status="accepted", shared_with_id=collab2.id)
        # Pending invite should NOT count
        make_list_share(db, lst.id, owner.id, status="pending")

        resp = client.get("/lists/groups", headers=auth_headers(owner))
        assert resp.status_code == 200
        the_list = next(l for l in resp.json() if l["id"] == lst.id)
        assert the_list["share_count"] == 2
