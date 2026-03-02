from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.list_item import ListItem
from ..models.shopping_list import ShoppingList
from ..models.user import User
from ..auth import get_current_user
from ..config import settings
from ..services.prediction import get_frequency_candidates, get_smart_suggestions
from ..services.recipe_suggestions import get_recipe_suggestions, warm_ingredient_pairings
from ..services.nl_parser import parse_shopping_input

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
    checked: int  # 0=active, 1=done, 2=soft-deleted
    sort_order: Optional[int]
    times_added: int

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
    checked: Optional[int] = None  # 0=active, 1=done, 2=soft-deleted
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

    min_order = db.query(sqlfunc.min(ListItem.sort_order)).filter(
        ListItem.user_id == user_id,
        ListItem.list_id == list_id,
        ListItem.checked == 0,
    ).scalar()
    top_order = (min_order - 1) if min_order is not None else 0

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
        .filter(
            ListItem.user_id == current_user.id,
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
    return items


@router.get("/items/deleted", response_model=list[ListItemOut])
def get_deleted_items(
    list_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id
    return (
        db.query(ListItem)
        .filter(
            ListItem.user_id == current_user.id,
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

    return _add_single_item(
        db, background_tasks, current_user.id, list_id,
        payload.name, payload.quantity, payload.unit,
    )


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

    parsed = parse_shopping_input(payload.text, settings.groq_api_key)

    results = []
    for parsed_item in parsed:
        item = _add_single_item(
            db, background_tasks, current_user.id, list_id,
            parsed_item["name"], parsed_item["quantity"], parsed_item.get("unit"),
        )
        results.append(item)

    return results


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

    item.checked = 2
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


@router.get("/recipe-suggestions", response_model=list[SuggestionOut])
def get_recipe_suggestions_endpoint(
    list_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not list_id:
        default = get_or_create_default_list(db, current_user.id)
        list_id = default.id

    # Get active (unchecked) items on the list
    active_items = (
        db.query(ListItem)
        .filter(
            ListItem.user_id == current_user.id,
            ListItem.list_id == list_id,
            ListItem.checked == 0,
        )
        .all()
    )
    item_names = [item.name for item in active_items]
    return get_recipe_suggestions(item_names, db)
