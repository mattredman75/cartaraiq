from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.list_item import ListItem
from ..models.shopping_list import ShoppingList
from ..models.user import User
from ..auth import get_current_user
from ..services.prediction import get_frequency_candidates, get_smart_suggestions

router = APIRouter(prefix="/lists", tags=["lists"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ShoppingListOut(BaseModel):
    id: str
    name: str

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
    checked: bool
    sort_order: Optional[int]
    times_added: int

    class Config:
        from_attributes = True


class AddItemRequest(BaseModel):
    name: str
    quantity: int = 1
    unit: Optional[str] = None
    list_id: Optional[str] = None


class UpdateItemRequest(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    checked: Optional[bool] = None
    sort_order: Optional[int] = None


class ReorderItem(BaseModel):
    id: str
    sort_order: int


class SuggestionOut(BaseModel):
    name: str
    reason: str


# ── Helper: get or create default list ───────────────────────────────────────

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


# ── Shopping list CRUD ────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[ShoppingListOut])
def get_lists(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lists = db.query(ShoppingList).filter(
        ShoppingList.user_id == current_user.id
    ).order_by(ShoppingList.created_at).all()
    if not lists:
        default = get_or_create_default_list(db, current_user.id)
        return [default]
    return lists


@router.post("/groups", response_model=ShoppingListOut, status_code=201)
def create_list(
    payload: CreateListRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = ShoppingList(user_id=current_user.id, name=payload.name)
    db.add(lst)
    db.commit()
    db.refresh(lst)
    return lst


@router.patch("/groups/{list_id}", response_model=ShoppingListOut)
def rename_list(
    list_id: str,
    payload: UpdateListRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id,
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    lst.name = payload.name
    db.commit()
    db.refresh(lst)
    return lst


@router.delete("/groups/{list_id}", status_code=204)
def delete_list(
    list_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lst = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id,
    ).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    db.query(ListItem).filter(ListItem.list_id == list_id).delete()
    db.delete(lst)
    db.commit()


# ── List items ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ListItemOut])
def get_list(
    list_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id

    from sqlalchemy import case
    items = (
        db.query(ListItem)
        .filter(ListItem.user_id == current_user.id, ListItem.list_id == list_id)
        .order_by(
            ListItem.checked,
            case((ListItem.sort_order == None, 1), else_=0),
            ListItem.sort_order,
            ListItem.created_at.desc(),
        )
        .all()
    )
    return items


@router.post("/items", response_model=ListItemOut, status_code=201)
def add_item(
    payload: AddItemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    list_id = payload.list_id
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id

    existing = (
        db.query(ListItem)
        .filter(
            ListItem.user_id == current_user.id,
            ListItem.list_id == list_id,
            ListItem.name.ilike(payload.name),
        )
        .first()
    )

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
        existing.quantity = payload.quantity
        existing.checked = False
        db.commit()
        db.refresh(existing)
        return existing

    # Assign sort_order as one beyond current max (so new items go to bottom)
    from sqlalchemy import func as sqlfunc
    max_order = db.query(sqlfunc.max(ListItem.sort_order)).filter(
        ListItem.user_id == current_user.id,
        ListItem.list_id == list_id,
    ).scalar() or 0

    item = ListItem(
        user_id=current_user.id,
        list_id=list_id,
        name=payload.name,
        quantity=payload.quantity,
        unit=payload.unit,
        sort_order=max_order + 1,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=ListItemOut)
def update_item(
    item_id: str,
    payload: UpdateItemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(ListItem).filter(
        ListItem.id == item_id,
        ListItem.user_id == current_user.id,
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    if payload.name is not None:
        item.name = payload.name
    if payload.quantity is not None:
        item.quantity = payload.quantity
    if payload.checked is not None:
        item.checked = payload.checked
    if payload.sort_order is not None:
        item.sort_order = payload.sort_order

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=204)
def delete_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(ListItem).filter(
        ListItem.id == item_id,
        ListItem.user_id == current_user.id,
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    db.delete(item)
    db.commit()


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
    order_map = {r.id: r.sort_order for r in payload}
    for item in items:
        item.sort_order = order_map[item.id]
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
    candidates = get_frequency_candidates(db, current_user.id, list_id=list_id)
    suggestions = get_smart_suggestions(candidates, current_user.id, list_id, db)
    return suggestions
