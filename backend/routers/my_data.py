from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from ..database import get_db
from ..models.list_item import ListItem
from ..models.shopping_list import ShoppingList
from ..auth import get_current_user
from ..models.user import User
from ..services.audit import log_audit

router = APIRouter(prefix="/my", tags=["my-data"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ItemExport(BaseModel):
    id: str
    name: str
    quantity: int
    unit: Optional[str]
    sort_order: Optional[int]
    times_added: int

    class Config:
        from_attributes = True


class ListExport(BaseModel):
    listName: str
    outstanding: List[ItemExport]
    completed: List[ItemExport]


class DataExport(BaseModel):
    lists: List[ListExport]
    exporter: str
    exported: str
    version: int = 1


class ItemImport(BaseModel):
    name: str
    quantity: int = 1
    unit: Optional[str] = None
    checked: int = 0
    sort_order: Optional[int] = None
    times_added: int = 1


class ListImport(BaseModel):
    listName: str
    outstanding: List[ItemImport] = []
    completed: List[ItemImport] = []


class DataImport(BaseModel):
    lists: List[ListImport]
    version: int = 1


# ── GET /my/data ─────────────────────────────────────────────────────────────

@router.get("/data", response_model=DataExport)
async def export_data(
    request: Request = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export all lists and items for the current user."""
    shopping_lists = (
        db.query(ShoppingList)
        .filter(ShoppingList.user_id == user.id)
        .order_by(ShoppingList.created_at)
        .all()
    )

    lists_out: list[ListExport] = []
    for sl in shopping_lists:
        outstanding = [
            ItemExport.model_validate(item)
            for item in sl.items
            if item.checked == 0
        ]
        completed = [
            ItemExport.model_validate(item)
            for item in sl.items
            if item.checked == 1
        ]
        lists_out.append(
            ListExport(
                listName=sl.name,
                outstanding=outstanding,
                completed=completed,
            )
        )

    log_audit(db, action="data_export", request=request, user_id=user.id, detail={"lists_count": len(lists_out)})

    return DataExport(
        lists=lists_out,
        exporter=user.id,
        exported=datetime.now(timezone.utc).isoformat(),
    )


# ── POST /my/data ────────────────────────────────────────────────────────────

@router.post("/data", response_model=DataExport)
async def import_data(
    payload: DataImport,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Replace all lists and items for the current user with the supplied JSON.
    Existing items and lists are deleted first.
    """
    # Delete existing items then lists for this user
    db.query(ListItem).filter(ListItem.user_id == user.id).delete()
    db.query(ShoppingList).filter(ShoppingList.user_id == user.id).delete()
    db.flush()

    # Re-create from payload
    for list_data in payload.lists:
        new_list = ShoppingList(user_id=user.id, name=list_data.listName)
        db.add(new_list)
        db.flush()  # populate new_list.id

        for item in list_data.outstanding:
            db.add(ListItem(
                user_id=user.id,
                list_id=new_list.id,
                name=item.name,
                quantity=item.quantity,
                unit=item.unit,
                checked=0,
                sort_order=item.sort_order,
                times_added=item.times_added,
            ))

        for item in list_data.completed:
            db.add(ListItem(
                user_id=user.id,
                list_id=new_list.id,
                name=item.name,
                quantity=item.quantity,
                unit=item.unit,
                checked=1,
                sort_order=item.sort_order,
                times_added=item.times_added,
            ))

    db.commit()

    log_audit(db, action="data_import", request=request, user_id=user.id, detail={"lists_count": len(payload.lists)})

    # Return the freshly-imported state using the same export logic
    return await export_data(request=request, user=user, db=db)
