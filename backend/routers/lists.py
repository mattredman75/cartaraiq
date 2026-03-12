from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.list_item import ListItem
from ..models.shopping_list import ShoppingList
from ..models.list_share import ListShare
from ..models.push_token import PushToken
from ..models.user import User
from ..models.item_group import ItemGroup
from ..auth import get_current_user
from ..config import settings
from ..services.prediction import get_frequency_candidates, get_smart_suggestions
from ..services.recipe_suggestions import get_recipe_suggestions, warm_ingredient_pairings, get_canonical_suggestions
from ..services.nl_parser import parse_shopping_input
from ..services.audit import log_audit
from ..services.push_notifications import send_push_notifications

router = APIRouter(prefix="/lists", tags=["lists"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ShoppingListOut(BaseModel):
    id: str
    name: str
    is_shared: bool = False
    owner_name: Optional[str] = None   # set when list is shared TO current user
    share_count: int = 0               # accepted collaborators on lists the user owns

    class Config:
        from_attributes = True


class CreateListRequest(BaseModel):
    name: str


class UpdateListRequest(BaseModel):
    name: str


class ListItemOut(BaseModel):
    id: str
    list_id: Optional[str]
    name: str
    quantity: int
    unit: Optional[str]
    checked: int  # 0=active, 1=done, 2=soft-deleted
    sort_order: Optional[int]
    times_added: int
    added_by_name: Optional[str] = None  # set on shared lists when item was added by someone else
    group_id: Optional[str] = None

    class Config:
        from_attributes = True


class AddItemRequest(BaseModel):
    name: str
    quantity: int = 1
    unit: Optional[str] = None
    list_id: Optional[str] = None


class BulkAddRequest(BaseModel):
    text: str
    list_id: Optional[str] = None


class UpdateItemRequest(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    checked: Optional[int] = None  # 0=active, 1=done, 2=soft-deleted
    sort_order: Optional[int] = None
    group_id: Optional[str] = None  # set to None to remove from group


class ReorderItem(BaseModel):
    id: str
    sort_order: int
    group_id: Optional[str] = None  # if provided, updates the item's group assignment


class GroupReorderItem(BaseModel):
    id: str
    sort_order: int


class FlatReorderPayload(BaseModel):
    items: list[ReorderItem]
    groups: list[GroupReorderItem] = []


class CreateGroupRequest(BaseModel):
    name: str
    item_ids: list[str]  # exactly 2 item IDs to seed the group


class RenameGroupRequest(BaseModel):
    name: str


class ItemGroupOut(BaseModel):
    id: str
    list_id: str
    name: str
    sort_order: Optional[int]

    class Config:
        from_attributes = True


class ParsedItemOut(BaseModel):
    name: str
    quantity: int
    unit: Optional[str] = None


class SuggestionOut(BaseModel):
    name: str
    reason: str


class ShareOut(BaseModel):
    id: str
    shared_with_id: Optional[str]
    shared_with_name: Optional[str]
    shared_with_email: Optional[str]
    shared_with_avatar_url: Optional[str] = None
    status: str  # "pending" | "accepted" | "declined"
    invite_url: str
    created_at: Optional[datetime] = None


class InvitePreviewOut(BaseModel):
    list_id: str
    list_name: str
    owner_name: Optional[str] = None
    owner_avatar_url: Optional[str] = None


class InviteOut(BaseModel):
    invite_url: str
    share_id: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_invite_url(token: str) -> str:
    from backend.config import settings
    # Must always be an https Universal Link so it works in browsers and for
    # users who don't yet have the app installed. Never use a custom URL scheme.
    return f"{settings.web_base_url}/share/{token}"


def _has_list_access(db: Session, list_id: str, user_id: str):
    """Return (list, is_owner). Raises 404 if not found, 403 if no access."""
    lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    if lst.user_id == user_id:
        return lst, True
    share = db.query(ListShare).filter(
        ListShare.list_id == list_id,
        ListShare.shared_with_id == user_id,
        ListShare.status == "accepted",
    ).first()
    if not share:
        raise HTTPException(status_code=403, detail="Access denied.")
    return lst, False


def _get_list_member_tokens(db: Session, list_id: str, exclude_user_id: str) -> list[str]:
    """Return push tokens for all list members except the actor."""
    lst = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not lst:
        return []
    shares = db.query(ListShare).filter(
        ListShare.list_id == list_id,
        ListShare.status == "accepted",
    ).all()
    member_ids = {lst.user_id} | {s.shared_with_id for s in shares if s.shared_with_id}
    member_ids.discard(exclude_user_id)
    if not member_ids:
        return []
    tokens = db.query(PushToken.token).filter(PushToken.user_id.in_(member_ids)).all()
    return [t[0] for t in tokens]




def get_or_create_default_list(db: Session, user_id: str) -> ShoppingList:
    lst = db.query(ShoppingList).filter(
        ShoppingList.user_id == user_id
    ).order_by(ShoppingList.created_at).first()
    if not lst:
        lst = ShoppingList(user_id=user_id, name="My List")
        db.add(lst)
        db.commit()
        db.refresh(lst)
    return lst


# ── Helper: add or update a single item ──────────────────────────────────────

def _add_single_item(
    db: Session,
    background_tasks: BackgroundTasks,
    user_id: str,
    list_id: str,
    name: str,
    quantity: int,
    unit: Optional[str],
) -> ListItem:
    now = datetime.now(timezone.utc)

    existing = (
        db.query(ListItem)
        .filter(
            ListItem.user_id == user_id,
            ListItem.list_id == list_id,
            ListItem.name.ilike(name),
        )
        .first()
    )

    if not existing:
        # Also check for a soft-deleted item on this list added by another user
        # (collaborator zombie rows). Reclaim it rather than creating a duplicate.
        existing = (
            db.query(ListItem)
            .filter(
                ListItem.list_id == list_id,
                ListItem.name.ilike(name),
                ListItem.checked == 2,
                ListItem.user_id != user_id,
            )
            .first()
        )
        if existing:
            existing.user_id = user_id  # transfer ownership for frequency tracking

    # Compute min across ALL items in the list (not just this user's) so new
    # items always land at the top even on shared lists.
    min_order = db.query(sqlfunc.min(ListItem.sort_order)).filter(
        ListItem.list_id == list_id,
        ListItem.checked == 0,
    ).scalar()
    top_order = (min_order - 1) if min_order is not None else 0

    # Clamp quantity to minimum 1 (fractional values from parser, e.g. 0.25, become 0 as int)
    quantity = max(1, quantity or 1)

    if existing:
        days_since = 0
        if existing.last_added_at:
            last = existing.last_added_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            days_since = (now - last).total_seconds() / 86400

        prev_avg = existing.avg_days_between_adds or days_since
        n = existing.times_added
        new_avg = ((prev_avg * (n - 1)) + days_since) / n if n > 1 else days_since

        existing.times_added += 1
        existing.last_added_at = now
        existing.avg_days_between_adds = new_avg
        existing.quantity = quantity
        existing.checked = 0
        existing.sort_order = top_order
        db.commit()
        db.refresh(existing)
        background_tasks.add_task(warm_ingredient_pairings, name)
        return existing

    item = ListItem(
        user_id=user_id,
        list_id=list_id,
        name=name,
        quantity=quantity,
        unit=unit,
        sort_order=top_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    background_tasks.add_task(warm_ingredient_pairings, name)
    return item


# ── Shopping list CRUD ────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[ShoppingListOut])
def get_lists(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Lists owned by the current user
    owned = db.query(ShoppingList).filter(
        ShoppingList.user_id == current_user.id
    ).order_by(ShoppingList.created_at).all()
    if not owned:
        default = get_or_create_default_list(db, current_user.id)
        owned = [default]

    # Build share counts for owned lists
    accepted_shares = db.query(ListShare).filter(
        ListShare.list_id.in_([l.id for l in owned]),
        ListShare.status == "accepted",
    ).all()
    share_count_map: dict[str, int] = {}
    for s in accepted_shares:
        share_count_map[s.list_id] = share_count_map.get(s.list_id, 0) + 1

    result = []
    for lst in owned:
        result.append(ShoppingListOut(
            id=lst.id,
            name=lst.name,
            is_shared=share_count_map.get(lst.id, 0) > 0,
            owner_name=None,
            share_count=share_count_map.get(lst.id, 0),
        ))

    # Lists shared TO the current user (accepted)
    shared_to_me = db.query(ListShare).filter(
        ListShare.shared_with_id == current_user.id,
        ListShare.status == "accepted",
    ).all()
    for share in shared_to_me:
        lst = db.query(ShoppingList).filter(ShoppingList.id == share.list_id).first()
        if lst:
            owner = db.query(User).filter(User.id == lst.user_id).first()
            result.append(ShoppingListOut(
                id=lst.id,
                name=lst.name,
                is_shared=True,
                owner_name=owner.name if owner else None,
                share_count=0,
            ))

    return result


@router.post("/groups", response_model=ShoppingListOut, status_code=201)
def create_list(
    payload: CreateListRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = ShoppingList(user_id=current_user.id, name=payload.name)
    db.add(lst)
    db.commit()
    db.refresh(lst)
    log_audit(db, action="list_create", request=request, user_id=current_user.id, detail={"list_id": lst.id, "name": payload.name})
    return lst


@router.patch("/groups/{list_id}", response_model=ShoppingListOut)
def rename_list(
    list_id: str,
    payload: UpdateListRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id,
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    old_name = lst.name
    lst.name = payload.name
    db.commit()
    db.refresh(lst)
    log_audit(db, action="list_rename", request=request, user_id=current_user.id, detail={"list_id": list_id, "old_name": old_name, "new_name": payload.name})
    return lst


@router.delete("/groups/{list_id}", status_code=204)
def delete_list(
    list_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id,
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    list_name = lst.name
    db.query(ListItem).filter(ListItem.list_id == list_id).delete()
    db.delete(lst)
    db.commit()
    log_audit(db, action="list_delete", request=request, user_id=current_user.id, detail={"list_id": list_id, "name": list_name})


# ── Sharing ───────────────────────────────────────────────────────────────────

@router.post("/groups/{list_id}/invite", response_model=InviteOut, status_code=201)
def invite_to_list(
    list_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a one-time invite link the owner can share with anyone."""
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id,
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")

    import uuid as _uuid
    token = str(_uuid.uuid4())
    share = ListShare(
        list_id=list_id,
        owner_id=current_user.id,
        invite_token=token,
        status="pending",
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    log_audit(db, action="list_invite_created", request=request, user_id=current_user.id,
              detail={"list_id": list_id, "share_id": share.id})
    return InviteOut(invite_url=_build_invite_url(token), share_id=share.id)


@router.get("/groups/{list_id}/shares", response_model=list[ShareOut])
def get_list_shares(
    list_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all accepted and pending shares for a list the user owns."""
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id,
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")

    shares = db.query(ListShare).filter(ListShare.list_id == list_id).all()
    result = []
    for s in shares:
        collaborator = db.query(User).filter(User.id == s.shared_with_id).first() if s.shared_with_id else None
        result.append(ShareOut(
            id=s.id,
            shared_with_id=s.shared_with_id,
            shared_with_name=collaborator.name if collaborator else None,
            shared_with_email=collaborator.email if collaborator else None,
            shared_with_avatar_url=collaborator.avatar_url if collaborator else None,
            status=s.status,
            invite_url=_build_invite_url(s.invite_token),
            created_at=s.created_at,
        ))
    return result


@router.delete("/groups/{list_id}/shares/{share_id}", status_code=204)
def remove_list_share(
    list_id: str,
    share_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a collaborator or revoke a pending invite. Owner only."""
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id,
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")

    share = db.query(ListShare).filter(
        ListShare.id == share_id,
        ListShare.list_id == list_id,
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found.")

    db.delete(share)
    db.commit()
    log_audit(db, action="list_share_removed", request=request, user_id=current_user.id,
              detail={"list_id": list_id, "share_id": share_id})


@router.post("/groups/{list_id}/leave", status_code=204)
def leave_list(
    list_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Collaborator removes themselves from a shared list."""
    share = db.query(ListShare).filter(
        ListShare.list_id == list_id,
        ListShare.shared_with_id == current_user.id,
        ListShare.status == "accepted",
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="You are not a member of this list.")
    db.delete(share)
    db.commit()
    log_audit(db, action="list_leave", request=request, user_id=current_user.id,
              detail={"list_id": list_id})


@router.get("/share/preview/{token}", response_model=InvitePreviewOut)
def preview_list_invite(
    token: str,
    db: Session = Depends(get_db),
):
    """Return list + owner info for an invite token. No authentication required."""
    share = db.query(ListShare).filter(ListShare.invite_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Invite not found or already used.")
    if share.status == "accepted":
        raise HTTPException(status_code=409, detail="Invite already accepted.")

    lst = db.query(ShoppingList).filter(ShoppingList.id == share.list_id).first()
    owner = db.query(User).filter(User.id == share.owner_id).first()

    avatar_url = None
    if owner and owner.avatar_url:
        if not owner.avatar_url.startswith("http"):
            avatar_url = f"{settings.server_url}/{owner.avatar_url.lstrip('/')}"
        else:
            avatar_url = owner.avatar_url

    return InvitePreviewOut(
        list_id=share.list_id,
        list_name=lst.name if lst else "Shared list",
        owner_name=owner.name if owner else None,
        owner_avatar_url=avatar_url,
    )


@router.post("/share/accept/{token}", status_code=200)
def accept_list_invite(
    token: str,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept a list invite via token. Returns the list name on success."""
    share = db.query(ListShare).filter(
        ListShare.invite_token == token,
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Invite not found or already used.")
    if share.status == "accepted":
        raise HTTPException(status_code=409, detail="Invite already accepted.")
    if share.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot accept your own invite.")

    # Check the user doesn't already have access
    existing = db.query(ListShare).filter(
        ListShare.list_id == share.list_id,
        ListShare.shared_with_id == current_user.id,
        ListShare.status == "accepted",
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You already have access to this list.")

    share.shared_with_id = current_user.id
    share.status = "accepted"
    db.commit()

    lst = db.query(ShoppingList).filter(ShoppingList.id == share.list_id).first()

    # Silent push to the owner so their app refreshes the collaborator list
    owner_tokens = [t[0] for t in db.query(PushToken.token).filter(PushToken.user_id == share.owner_id).all()]
    if owner_tokens:
        background_tasks.add_task(
            send_push_notifications, owner_tokens,
            None, None,
            {"type": "invite_accepted", "list_id": share.list_id, "accepted_by": current_user.name},
            content_available=True,
        )

    log_audit(db, action="list_invite_accepted", request=request, user_id=current_user.id,
              detail={"list_id": share.list_id, "share_id": share.id})
    return {"list_id": share.list_id, "list_name": lst.name if lst else None}


@router.post("/share/decline/{token}", status_code=200)
def decline_list_invite(
    token: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Decline a list invite via token."""
    share = db.query(ListShare).filter(ListShare.invite_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if share.status == "accepted":
        raise HTTPException(status_code=409, detail="Invite already accepted.")

    share.shared_with_id = current_user.id
    share.status = "declined"
    db.commit()
    log_audit(db, action="list_invite_declined", request=request, user_id=current_user.id,
              detail={"list_id": share.list_id, "share_id": share.id})
    return {"detail": "Invite declined."}


@router.get("", response_model=list[ListItemOut])
def get_list(
    list_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id

    lst, _ = _has_list_access(db, list_id, current_user.id)
    is_shared = lst.user_id != current_user.id or db.query(ListShare).filter(
        ListShare.list_id == list_id,
        ListShare.status == "accepted",
    ).count() > 0

    from sqlalchemy import case
    items = (
        db.query(ListItem)
        .filter(
            ListItem.list_id == list_id,
            ListItem.checked != 2,
        )
        .order_by(
            ListItem.checked,
            case((ListItem.sort_order == None, 1), else_=0),
            ListItem.sort_order,
            ListItem.created_at.desc(),
        )
        .all()
    )

    result = []
    for item in items:
        added_by = None
        if is_shared:
            if item.user_id == current_user.id:
                added_by = "you"
            else:
                adder = db.query(User).filter(User.id == item.user_id).first()
                added_by = adder.name if adder else None
        result.append(ListItemOut(
            id=item.id,
            list_id=item.list_id,
            name=item.name,
            quantity=item.quantity,
            unit=item.unit,
            checked=item.checked,
            sort_order=item.sort_order,
            times_added=item.times_added,
            added_by_name=added_by,
            group_id=item.group_id,
        ))
    return result


# ── Item Groups CRUD ──────────────────────────────────────────────────────────

@router.get("/groups/{list_id}/item-groups", response_model=list[ItemGroupOut])
def get_item_groups(
    list_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _has_list_access(db, list_id, current_user.id)
    return (
        db.query(ItemGroup)
        .filter(ItemGroup.list_id == list_id)
        .order_by(ItemGroup.sort_order, ItemGroup.created_at)
        .all()
    )


@router.post("/groups/{list_id}/item-groups", response_model=ItemGroupOut, status_code=201)
def create_item_group(
    list_id: str,
    payload: CreateGroupRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _has_list_access(db, list_id, current_user.id)
    if len(payload.item_ids) < 1:
        raise HTTPException(status_code=422, detail="A group requires at least 1 item.")

    # Compute sort_order: place group at the min sort_order of the seeding items
    seeding_items = (
        db.query(ListItem)
        .filter(ListItem.id.in_(payload.item_ids), ListItem.list_id == list_id)
        .all()
    )
    if len(seeding_items) < 1:
        raise HTTPException(status_code=404, detail="Item not found.")

    min_order = min((i.sort_order or 0) for i in seeding_items)
    group = ItemGroup(
        list_id=list_id,
        user_id=current_user.id,
        name=payload.name,
        sort_order=min_order,
    )
    db.add(group)
    db.flush()  # get group.id before assigning to items

    for i, item in enumerate(seeding_items):
        item.group_id = group.id
        item.sort_order = i  # reset sort_order within group

    db.commit()
    db.refresh(group)
    tokens = _get_list_member_tokens(db, list_id, current_user.id)
    if tokens:
        background_tasks.add_task(
            send_push_notifications, tokens,
            f"{current_user.name} created a group",
            payload.name,
            {"type": "list_update", "list_id": list_id},
        )
    return group


@router.patch("/item-groups/{group_id}", response_model=ItemGroupOut)
def rename_item_group(
    group_id: str,
    payload: RenameGroupRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(ItemGroup).filter(ItemGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")
    _has_list_access(db, group.list_id, current_user.id)
    list_id = group.list_id
    group.name = payload.name.strip()
    db.commit()
    db.refresh(group)
    tokens = _get_list_member_tokens(db, list_id, current_user.id)
    if tokens:
        background_tasks.add_task(
            send_push_notifications, tokens,
            f"{current_user.name} renamed a group",
            group.name,
            {"type": "list_update", "list_id": list_id},
        )
    return group


@router.delete("/item-groups/{group_id}", status_code=204)
def delete_item_group(
    group_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dissolve a group. Items in the group become ungrouped (group_id → None)."""
    group = db.query(ItemGroup).filter(ItemGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")
    _has_list_access(db, group.list_id, current_user.id)
    list_id = group.list_id
    group_name = group.name

    # Ungrouping items: keep their current sort_order, just clear group_id
    db.query(ListItem).filter(ListItem.group_id == group_id).update(
        {ListItem.group_id: None}
    )
    db.delete(group)
    db.commit()
    tokens = _get_list_member_tokens(db, list_id, current_user.id)
    if tokens:
        background_tasks.add_task(
            send_push_notifications, tokens,
            f"{current_user.name} removed a group",
            group_name,
            {"type": "list_update", "list_id": list_id},
        )


@router.put("/groups/{list_id}/reorder", status_code=204)
def reorder_list(
    list_id: str,
    payload: FlatReorderPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reorder items and/or groups in one shot. Updates sort_order and group membership."""
    _has_list_access(db, list_id, current_user.id)

    # Update group sort orders
    if payload.groups:
        group_ids = [g.id for g in payload.groups]
        groups = db.query(ItemGroup).filter(
            ItemGroup.id.in_(group_ids),
            ItemGroup.list_id == list_id,
        ).all()
        group_map = {g.id: g for g in groups}
        for g_entry in payload.groups:
            if g_entry.id in group_map:
                group_map[g_entry.id].sort_order = g_entry.sort_order

    # Update item sort orders and group assignments
    if payload.items:
        item_ids = [i.id for i in payload.items]
        items = db.query(ListItem).filter(
            ListItem.id.in_(item_ids),
            ListItem.list_id == list_id,
        ).all()
        item_map = {i.id: i for i in items}
        for i_entry in payload.items:
            if i_entry.id in item_map:
                item_map[i_entry.id].sort_order = i_entry.sort_order
                if i_entry.group_id is not None:
                    item_map[i_entry.id].group_id = i_entry.group_id
                # NOTE: group_id == None in entry means "keep existing" (use PATCH /item-groups to ungroup)

    db.commit()


# ─────────────────────────────────────────────────────────────────────────────

@router.get("/items/deleted", response_model=list[ListItemOut])
def get_deleted_items(
    list_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id
    _has_list_access(db, list_id, current_user.id)
    return (
        db.query(ListItem)
        .filter(
            ListItem.list_id == list_id,
            ListItem.checked == 2,
        )
        .all()
    )


@router.post("/items", response_model=ListItemOut, status_code=201)
def add_item(
    payload: AddItemRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    list_id = payload.list_id
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id
    else:
        _has_list_access(db, list_id, current_user.id)

    item = _add_single_item(
        db, background_tasks, current_user.id, list_id,
        payload.name, payload.quantity, payload.unit,
    )

    tokens = _get_list_member_tokens(db, list_id, current_user.id)
    if tokens:
        background_tasks.add_task(
            send_push_notifications, tokens,
            f"{current_user.name} added to the list",
            payload.name,
            {"type": "list_update", "list_id": list_id},
        )

    return ListItemOut(
        id=item.id, list_id=item.list_id, name=item.name,
        quantity=item.quantity, unit=item.unit, checked=item.checked,
        sort_order=item.sort_order, times_added=item.times_added,
        group_id=getattr(item, 'group_id', None),
    )


# ── Debug endpoint (temporary) ───────────────────────────────────────────────

@router.get("/debug/groq")
def debug_groq(current_user: User = Depends(get_current_user)):
    """Temporary endpoint: returns Groq config status as JSON. No logs needed."""
    import importlib, sys
    key = settings.groq_api_key or ""
    groq_installed = "groq" in sys.modules or importlib.util.find_spec("groq") is not None
    result = {
        "groq_key_set": bool(key),
        "groq_key_preview": (key[:8] + "..." + key[-4:]) if len(key) > 12 else ("<empty>" if not key else key),
        "groq_package_installed": groq_installed,
    }
    if groq_installed and key:
        try:
            parsed = parse_shopping_input("2 avocados and a lime", key)
            result["test_parse"] = parsed
            result["test_status"] = "ok"
        except Exception as e:
            result["test_status"] = f"error: {e}"
    return result


# NOTE: /items/bulk must be defined before /items/{item_id} to prevent FastAPI
# from matching the literal string "bulk" as an item_id path parameter.
@router.post("/items/bulk", response_model=list[ListItemOut], status_code=201)
def bulk_add_items(
    payload: BulkAddRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    list_id = payload.list_id
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id
    else:
        _has_list_access(db, list_id, current_user.id)

    parsed = parse_shopping_input(payload.text, settings.groq_api_key)

    results = []
    for parsed_item in parsed:
        item = _add_single_item(
            db, background_tasks, current_user.id, list_id,
            parsed_item["name"], parsed_item["quantity"], parsed_item.get("unit"),
        )
        results.append(item)

    tokens = _get_list_member_tokens(db, list_id, current_user.id)
    if tokens and results:
        names = ", ".join(r.name for r in results[:3])
        background_tasks.add_task(
            send_push_notifications, tokens,
            f"{current_user.name} added to the list",
            names,
            {"type": "list_update", "list_id": list_id},
        )

    return results


# NOTE: /items/parse-text must be defined before /items/{item_id} to avoid
# FastAPI treating "parse-text" as an item_id path parameter.
@router.post("/items/parse-text", response_model=list[ParsedItemOut])
def parse_item_text(
    payload: BulkAddRequest,
    current_user: User = Depends(get_current_user),
):
    return parse_shopping_input(payload.text, settings.groq_api_key)


# NOTE: /items/{item_id}/permanent must be defined before /items/{item_id} (DELETE)
# so FastAPI resolves the more-specific path first.
@router.delete("/items/{item_id}/permanent", status_code=204)
def hard_delete_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(ListItem).filter(ListItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    _, is_owner = _has_list_access(db, item.list_id, current_user.id)
    if not is_owner and item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete items added by others.")
    db.delete(item)
    db.commit()


@router.patch("/items/{item_id}", response_model=ListItemOut)
def update_item(
    item_id: str,
    payload: UpdateItemRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(ListItem).filter(ListItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    # Shared lists are collaborative: any accepted member can update items.
    _has_list_access(db, item.list_id, current_user.id)
    original_group_id = item.group_id

    if payload.name is not None:
        item.name = payload.name
    if payload.quantity is not None:
        item.quantity = payload.quantity
    if payload.unit is not None:
        item.unit = payload.unit
    if payload.checked is not None:
        item.checked = payload.checked
    if payload.checked == 0:
        # Item transitioning back to active — place it at the top of the list
        min_order = db.query(sqlfunc.min(ListItem.sort_order)).filter(
            ListItem.list_id == item.list_id,
            ListItem.checked == 0,
        ).scalar()
        item.sort_order = (min_order - 1) if min_order is not None else 0
    elif payload.sort_order is not None:
        item.sort_order = payload.sort_order

    explicit_group_update = False
    if payload.group_id is not None:
        # Explicit group assignment (empty string = ungroup)
        explicit_group_update = True
        item.group_id = payload.group_id if payload.group_id else None
    elif 'group_id' in (
        getattr(payload, 'model_fields_set', None)
        or getattr(payload, '__pydantic_fields_set__', None)
        or getattr(payload, '__fields_set__', set())
    ):
        # group_id was explicitly passed as null — ungroup (Pydantic v2: model_fields_set)
        explicit_group_update = True
        item.group_id = None

    if (
        explicit_group_update
        and original_group_id is not None
        and item.group_id is None
        and item.checked == 0
    ):
        # Removing from a group must place the item first in the active list.
        min_order = db.query(sqlfunc.min(ListItem.sort_order)).filter(
            ListItem.list_id == item.list_id,
            ListItem.checked == 0,
            ListItem.id != item.id,
        ).scalar()
        item.sort_order = (min_order - 1) if min_order is not None else 0

    db.commit()
    db.refresh(item)

    tokens = _get_list_member_tokens(db, item.list_id, current_user.id)
    if tokens and payload.checked == 1:
        background_tasks.add_task(
            send_push_notifications, tokens,
            f"{current_user.name} checked off an item",
            item.name,
            {"type": "list_update", "list_id": item.list_id},
        )

    return ListItemOut(
        id=item.id, list_id=item.list_id, name=item.name,
        quantity=item.quantity, unit=item.unit, checked=item.checked,
        sort_order=item.sort_order, times_added=item.times_added,
        group_id=item.group_id,
    )


@router.delete("/items/{item_id}", status_code=204)
def delete_item(
    item_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(ListItem).filter(ListItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    _, is_owner = _has_list_access(db, item.list_id, current_user.id)
    if not is_owner and item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete items added by others.")

    list_id = item.list_id
    item_name = item.name
    item.checked = 2
    db.commit()

    tokens = _get_list_member_tokens(db, list_id, current_user.id)
    if tokens:
        background_tasks.add_task(
            send_push_notifications, tokens,
            f"{current_user.name} removed an item",
            item_name,
            {"type": "list_update", "list_id": list_id},
        )


@router.put("/items/reorder", status_code=204)
def reorder_items(
    payload: list[ReorderItem],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ids = [r.id for r in payload]
    items = db.query(ListItem).filter(
        ListItem.id.in_(ids),
        ListItem.user_id == current_user.id,
    ).all()
    order_map = {r.id: r for r in payload}
    for item in items:
        entry = order_map[item.id]
        item.sort_order = entry.sort_order
        if entry.group_id is not None:
            item.group_id = entry.group_id
    db.commit()


@router.get("/suggestions", response_model=list[SuggestionOut])
def get_suggestions(
    list_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id
    
    # Get all candidates
    candidates = get_frequency_candidates(db, current_user.id)
    
    # Get items already on the list (unchecked) — list-wide, not filtered by
    # user_id so that collaborator-added items are correctly excluded too
    on_list = db.query(ListItem).filter(
        ListItem.list_id == list_id,
        ListItem.checked == 0,
    ).all()
    on_list_names = {item.name.lower() for item in on_list}
    
    # Filter candidates to exclude items already on list
    filtered_candidates = [
        c for c in candidates if c.name.lower() not in on_list_names
    ]
    
    suggestions = get_smart_suggestions(filtered_candidates, current_user.id, list_id, db)
    return suggestions


@router.get("/recipe-suggestions", response_model=list[SuggestionOut])
def get_recipe_suggestions_endpoint(
    list_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id

    # Get active (unchecked) items on the list — list-wide so pairing uses
    # the full picture including items added by collaborators
    active_items = (
        db.query(ListItem)
        .filter(
            ListItem.list_id == list_id,
            ListItem.checked == 0,
        )
        .all()
    )
    item_names = [item.name for item in active_items]

    # Primary: canonical co-occurrence suggestions from our recipe DB
    results = get_canonical_suggestions(item_names, db)

    # Fallback: TheMealDB external API pairings
    if not results:
        results = get_recipe_suggestions(item_names, db)

    return results
