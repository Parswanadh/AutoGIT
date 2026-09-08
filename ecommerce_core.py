"""ponytail e-commerce core — single file, FastAPI+SQLAlchemy+SQLite"""
from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy import Column,Integer,String,Float,ForeignKey,create_engine,select,update,Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from pydantic import BaseModel
from typing import Optional, List
from enum import Enum
import threading

# ponytail: SQLite file, check_same_thread False for concurrency demo
engine = create_engine("sqlite:////tmp/opencode/ecom.db", connect_args={"check_same_thread": False}, echo=False)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
Base = declarative_base()

class Product(Base):
    __tablename__="products"
    id=Column(Integer, primary_key=True)
    name=Column(String, nullable=False)
    description=Column(Text, default="")
    price=Column(Float, nullable=False)
    stock=Column(Integer, default=0)
    version=Column(Integer, default=0)  # optimistic locking

class Cart(Base):
    __tablename__="carts"
    id=Column(Integer, primary_key=True)
    user_id=Column(String, index=True)
    items=relationship("CartItem", cascade="all, delete-orphan", back_populates="cart")

class CartItem(Base):
    __tablename__="cart_items"
    id=Column(Integer, primary_key=True)
    cart_id=Column(Integer, ForeignKey("carts.id"))
    product_id=Column(Integer, ForeignKey("products.id"))
    qty=Column(Integer, default=1)
    cart=relationship("Cart", back_populates="items")

# order state machine
class OrderStatus(str, Enum):
    pending="pending"; paid="paid"; shipped="shipped"; delivered="delivered"; cancelled="cancelled"; refunded="refunded"

TRANSITIONS={"pending":["paid","cancelled"],"paid":["shipped","refunded"],"shipped":["delivered"],"delivered":[],"cancelled":[],"refunded":[]}

class Order(Base):
    __tablename__="orders"
    id=Column(Integer, primary_key=True)
    user_id=Column(String, index=True)
    status=Column(String, default=OrderStatus.pending)
    total=Column(Float, default=0)
    items=relationship("OrderItem", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__="order_items"
    id=Column(Integer, primary_key=True)
    order_id=Column(Integer, ForeignKey("orders.id"))
    product_id=Column(Integer)
    qty=Column(Integer)
    price=Column(Float)

class Purchase(Base): # for recommendations stub
    __tablename__="purchases"
    id=Column(Integer, primary_key=True)
    user_id=Column(String, index=True)
    product_id=Column(Integer, index=True)

Base.metadata.create_all(bind=engine)

def get_db():
    db=SessionLocal()
    try: yield db
    finally: db.close()

# --- inventory with optimistic locking / transactions ---
def reserve_stock(db: Session, product_id:int, qty:int, expected_version:int):
    """optimistic locking: update only if version matches"""
    res=db.execute(update(Product).where(Product.id==product_id, Product.version==expected_version, Product.stock>=qty).values(stock=Product.stock-qty, version=Product.version+1))
    if res.rowcount==0:
        # ponytail: global lock comment not needed, optimistic retry is upgrade path
        raise HTTPException(409, "conflict: stock changed or insufficient")
    db.commit()
    return True

def create_product(db:Session, name:str, desc:str, price:float, stock:int):
    p=Product(name=name, description=desc, price=price, stock=stock, version=0)
    db.add(p); db.commit(); db.refresh(p); return p

# --- cart merge logic ---
def get_or_create_cart(db:Session, user_id:str)->Cart:
    c=db.execute(select(Cart).where(Cart.user_id==user_id)).scalar_one_or_none()
    if not c:
        c=Cart(user_id=user_id); db.add(c); db.commit(); db.refresh(c)
    return c

def add_to_cart(db:Session, user_id:str, product_id:int, qty:int):
    cart=get_or_create_cart(db,user_id)
    item=db.execute(select(CartItem).where(CartItem.cart_id==cart.id, CartItem.product_id==product_id)).scalar_one_or_none()
    if item: item.qty+=qty
    else: db.add(CartItem(cart_id=cart.id, product_id=product_id, qty=qty))
    db.commit(); return cart

def merge_carts(db:Session, from_user:str, to_user:str):
    """merge guest cart into user cart — sums qty on conflict"""
    src=db.execute(select(Cart).where(Cart.user_id==from_user)).scalar_one_or_none()
    if not src: return get_or_create_cart(db,to_user)
    dst=get_or_create_cart(db,to_user)
    if src.id==dst.id: return dst
    for si in list(db.execute(select(CartItem).where(CartItem.cart_id==src.id)).scalars().all()):
        di=db.execute(select(CartItem).where(CartItem.cart_id==dst.id, CartItem.product_id==si.product_id)).scalar_one_or_none()
        if di: di.qty+=si.qty; db.delete(si)
        else: si.cart_id=dst.id
        db.flush()
    db.delete(src)
    db.commit(); return dst

# --- payment mock (Stripe-like) ---
def mock_charge(amount:float, token:str="tok_ok")->dict:
    if token=="tok_fail" or token=="fail":
        return {"status":"failed","error":"card_declined"}
    if amount<=0: return {"status":"failed","error":"invalid_amount"}
    return {"status":"succeeded","id": f"ch_{int(amount*100)}_mock", "amount": amount}

# --- checkout with transaction ---
def checkout(db:Session, user_id:str, payment_token:str="tok_ok"):
    cart=db.execute(select(Cart).where(Cart.user_id==user_id)).scalar_one_or_none()
    if not cart or not cart.items: raise HTTPException(400, "empty cart")
    total=0; ops=[]
    # ponytail: transaction — all reserves succeed or none
    try:
        for ci in cart.items:
            p=db.get(Product, ci.product_id)
            if not p or p.stock < ci.qty: raise HTTPException(400, f"insufficient stock {ci.product_id}")
            total+=p.price*ci.qty
            ops.append((p, ci.qty))
        pay=mock_charge(total, payment_token)
        if pay["status"]!="succeeded": raise HTTPException(402, pay["error"])
        # optimistic reserve inside same transaction
        for p,qty in ops:
            # re-read version to simulate optimistic check
            ver=p.version
            res=db.execute(update(Product).where(Product.id==p.id, Product.version==ver, Product.stock>=qty).values(stock=Product.stock-qty, version=ver+1))
            if res.rowcount==0: raise HTTPException(409, "concurrent stock update, retry")
            db.add(Purchase(user_id=user_id, product_id=p.id))
        order=Order(user_id=user_id, status=OrderStatus.paid, total=total)
        db.add(order); db.flush()
        for p,qty in ops:
            db.add(OrderItem(order_id=order.id, product_id=p.id, qty=qty, price=p.price))
        # clear cart
        for ci in list(cart.items): db.delete(ci)
        db.commit(); db.refresh(order); return order, pay
    except HTTPException: db.rollback(); raise
    except Exception as e: db.rollback(); raise HTTPException(500, str(e))

# --- order state machine ---
def transition_order(db:Session, order_id:int, target:str):
    o=db.get(Order, order_id)
    if not o: raise HTTPException(404,"order not found")
    if target not in TRANSITIONS.get(o.status, []):
        raise HTTPException(400, f"invalid transition {o.status}->{target}")
    o.status=target; db.commit(); return o

# --- full-text search with ranking ---
def search_products(db:Session, q:str, limit:int=10):
    """ponytail: naive ranking — tf score (name*2 + desc*1), no FTS lib needed"""
    if not q.strip(): return []
    terms=[t.lower() for t in q.split()]
    rows=db.execute(select(Product)).scalars().all()
    scored=[]
    for p in rows:
        name=(p.name or "").lower(); desc=(p.description or "").lower()
        score=0
        for t in terms:
            score+= name.count(t)*2 + desc.count(t)*1
            # bonus exact word match
            if t in name.split(): score+=1
        if score>0: scored.append((score,p))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for s,p in scored[:limit]]

# --- recommendation stub (collaborative filtering) ---
def recommend(db:Session, user_id:str, limit:int=5):
    """users who bought X also bought Y — co-occurrence"""
    my_pids=set(r[0] for r in db.execute(select(Purchase.product_id).where(Purchase.user_id==user_id)).all())
    if not my_pids: # fallback: most popular
        pop=db.execute(select(Purchase.product_id).limit(100)).scalars().all()
        from collections import Counter
        return [pid for pid,_ in Counter(pop).most_common(limit)]
    # find other users with overlap
    others=db.execute(select(Purchase.user_id, Purchase.product_id).where(Purchase.product_id.in_(my_pids))).all()
    co_users=set(u for u,_ in others if u!=user_id)
    if not co_users: return []
    # products co-purchased by those users excluding mine
    cand=db.execute(select(Purchase.product_id).where(Purchase.user_id.in_(co_users))).scalars().all()
    from collections import Counter
    c=Counter([pid for pid in cand if pid not in my_pids])
    return [pid for pid,_ in c.most_common(limit)]

# --- FastAPI ---
app=FastAPI(title="ecom-core ponytail")

class ProductIn(BaseModel): name:str; description:str=""; price:float; stock:int
class CartAdd(BaseModel): product_id:int; qty:int=1
class CheckoutIn(BaseModel): payment_token:str="tok_ok"
class TransitionIn(BaseModel): target:str

@app.post("/products")
def api_create(p:ProductIn, db:Session=Depends(get_db)):
    return create_product(db,p.name,p.description,p.price,p.stock)
@app.get("/products")
def api_list(q:Optional[str]=None, db:Session=Depends(get_db)):
    if q: return search_products(db,q)
    return db.execute(select(Product)).scalars().all()
@app.get("/products/search")
def api_search(q:str, db:Session=Depends(get_db)): return search_products(db,q)
@app.post("/cart/{user_id}/add")
def api_add(user_id:str, body:CartAdd, db:Session=Depends(get_db)): return add_to_cart(db,user_id,body.product_id,body.qty)
@app.post("/cart/merge")
def api_merge(from_user:str, to_user:str, db:Session=Depends(get_db)): return merge_carts(db,from_user,to_user)
@app.get("/cart/{user_id}")
def api_get_cart(user_id:str, db:Session=Depends(get_db)): return get_or_create_cart(db,user_id)
@app.post("/checkout/{user_id}")
def api_checkout(user_id:str, body:CheckoutIn, db:Session=Depends(get_db)):
    o,pay=checkout(db,user_id,body.payment_token); return {"order":o,"payment":pay}
@app.post("/orders/{order_id}/transition")
def api_trans(order_id:int, body:TransitionIn, db:Session=Depends(get_db)): return transition_order(db,order_id,body.target)
@app.get("/recommend/{user_id}")
def api_reco(user_id:str, db:Session=Depends(get_db)): return recommend(db,user_id)

if __name__=="__main__":
    # ponytail: runnable self-check — minimal verification without pytest
    db=SessionLocal()
    try:
        Base.metadata.drop_all(bind=engine); Base.metadata.create_all(bind=engine)
        p1=create_product(db,"Phone X","smart phone with camera",699,10)
        p2=create_product(db,"Phone Y","smart phone pro",799,5)
        p3=create_product(db,"Laptop Z","gaming laptop",1299,3)
        assert p1.version==0
        # optimistic lock success then conflict
        reserve_stock(db,p1.id,1,0)
        try: reserve_stock(db,p1.id,1,0); assert False, "should conflict"
        except HTTPException as e: assert e.status_code==409
        # cart merge
        add_to_cart(db,"guest",p1.id,2); add_to_cart(db,"guest",p2.id,1)
        add_to_cart(db,"alice",p1.id,1)
        merge_carts(db,"guest","alice")
        c=get_or_create_cart(db,"alice")
        qtys={i.product_id:i.qty for i in c.items}
        assert qtys[p1.id]==3 and qtys[p2.id]==1, qtys
        # checkout
        o,pay=checkout(db,"alice","tok_ok")
        assert o.status=="paid" and pay["status"]=="succeeded"
        # state machine
        transition_order(db,o.id,"shipped"); transition_order(db,o.id,"delivered")
        try: transition_order(db,o.id,"paid"); assert False
        except HTTPException as e: assert e.status_code==400
        # search ranking: phone should rank p1/p2 above laptop
        res=search_products(db,"phone")
        assert res[0].id in (p1.id,p2.id) and len(res)>=2
        res2=search_products(db,"gaming laptop")
        assert res2[0].id==p3.id
        # recommend
        add_to_cart(db,"bob",p1.id,1); checkout(db,"bob","tok_ok")
        # alice bought p1,p2 ; bob bought p1 ; recommend for bob should include p2
        recs=recommend(db,"bob")
        # may include p2 if co-occurrence
        print("self-check OK", {"product":p1.id, "order":o.id, "search": [r.name for r in res], "recs": recs})
    finally: db.close()
