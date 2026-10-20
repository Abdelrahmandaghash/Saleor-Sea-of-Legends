from decimal import Decimal
import os
import re
from uuid import UUID

import psycopg
from flask import Flask, jsonify, request
from psycopg.rows import dict_row

app = Flask(__name__)
DATABASE_URL = os.environ["DATABASE_URL"]

PRODUCTS = [
    {
        "id": "p1",
        "name": "The Crimson Corsair",
        "description": "A foil captain card with a cutlass strike and a bounty worth claiming.",
        "price": 18.0,
        "category": "Trading Cards",
        "badge": "Mythic · Captain",
        "power": 87,
        "guard": 64,
        "stock": 5,
        "rating": 4.9,
        "review_count": 128,
        "image_url": "/images/cards/crimson-corsair.svg",
    },
    {
        "id": "p2",
        "name": "The Ghost Galleon",
        "description": "A haunted ship card that slips through fog and strikes under moonlight.",
        "price": 16.0,
        "category": "Trading Cards",
        "badge": "Epic · Ship",
        "power": 72,
        "guard": 92,
        "stock": 5,
        "rating": 4.8,
        "review_count": 86,
        "image_url": "/images/cards/ghost-galleon.svg",
    },
    {
        "id": "p3",
        "name": "Kraken of Blackwater",
        "description": "An ancient sea-monster card. Play it when the tide turns against your rivals.",
        "price": 22.0,
        "category": "Creature Cards",
        "badge": "Legendary · Creature",
        "power": 99,
        "guard": 73,
        "stock": 5,
        "rating": 4.9,
        "review_count": 54,
        "image_url": "/images/cards/blackwater-kraken.svg",
    },
    {
        "id": "p4",
        "name": "The Cursed Compass",
        "description": "A rare relic card that points toward buried gold—or your greatest mistake.",
        "price": 14.0,
        "category": "Treasure Cards",
        "badge": "Rare · Relic",
        "power": 40,
        "guard": 100,
        "stock": 5,
        "rating": 4.7,
        "review_count": 73,
        "image_url": "/images/cards/cursed-compass.svg",
    },
    {
        "id": "p5",
        "name": "Blackbeard, the Iron Captain",
        "description": "A hand-painted 3D pirate captain miniature to lead your crew into battle.",
        "price": 38.0,
        "category": "Pirate Figures",
        "badge": "3D Figure · Mythic",
        "power": 91,
        "guard": 78,
        "stock": 5,
        "rating": 4.9,
        "review_count": 42,
        "image_url": "/images/cards/blackbeard-miniature.svg",
    },
    {
        "id": "p6",
        "name": "The Flying Dutchman",
        "description": "A ghost-ship fleet model with torn black sails and a cursed green lantern.",
        "price": 46.0,
        "category": "Ship Models",
        "badge": "3D Ship · Legendary",
        "power": 94,
        "guard": 89,
        "stock": 5,
        "rating": 4.8,
        "review_count": 61,
        "image_url": "/images/cards/flying-dutchman-model.svg",
    },
]


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
                category TEXT NOT NULL,
                badge TEXT NOT NULL,
                power INTEGER NOT NULL DEFAULT 50 CHECK (power BETWEEN 0 AND 100),
                guard INTEGER NOT NULL DEFAULT 50 CHECK (guard BETWEEN 0 AND 100),
                stock INTEGER NOT NULL DEFAULT 5 CHECK (stock BETWEEN 0 AND 5),
                rating NUMERIC(2, 1) NOT NULL,
                review_count INTEGER NOT NULL CHECK (review_count >= 0),
                image_url TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            ALTER TABLE products
            ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 5
            CHECK (stock BETWEEN 0 AND 5)
            """
        )
        connection.execute(
            """
            ALTER TABLE products
            ADD COLUMN IF NOT EXISTS power INTEGER NOT NULL DEFAULT 50
            CHECK (power BETWEEN 0 AND 100)
            """
        )
        connection.execute(
            """
            ALTER TABLE products
            ADD COLUMN IF NOT EXISTS guard INTEGER NOT NULL DEFAULT 50
            CHECK (guard BETWEEN 0 AND 100)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS cart_items (
                cart_id UUID NOT NULL,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 5),
                PRIMARY KEY (cart_id, product_id)
            )
            """
        )
        connection.execute(
            """
            ALTER TABLE cart_items
            DROP CONSTRAINT IF EXISTS cart_items_quantity_check
            """
        )
        connection.execute("UPDATE cart_items SET quantity = 5 WHERE quantity > 5")
        connection.execute(
            """
            ALTER TABLE cart_items
            ADD CONSTRAINT cart_items_quantity_check CHECK (quantity BETWEEN 1 AND 5)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                customer_name TEXT NOT NULL,
                email TEXT NOT NULL,
                shipping_address TEXT NOT NULL,
                cart_id UUID NOT NULL,
                total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS order_items (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id TEXT NOT NULL REFERENCES products(id),
                product_name TEXT NOT NULL,
                unit_price NUMERIC(10, 2) NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0)
            )
            """
        )
        for product in PRODUCTS:
            connection.execute(
                """
                INSERT INTO products
                    (id, name, description, price, category, badge, power, guard, stock, rating, review_count, image_url)
                VALUES
                    (%(id)s, %(name)s, %(description)s, %(price)s, %(category)s, %(badge)s, %(power)s, %(guard)s, %(stock)s,
                     %(rating)s, %(review_count)s, %(image_url)s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    price = EXCLUDED.price,
                    category = EXCLUDED.category,
                    badge = EXCLUDED.badge,
                    power = EXCLUDED.power,
                    guard = EXCLUDED.guard,
                    rating = EXCLUDED.rating,
                    review_count = EXCLUDED.review_count,
                    image_url = EXCLUDED.image_url
                """,
                product,
            )


def serialize_product(product):
    return {
        **product,
        "price": float(product["price"]),
        "rating": float(product["rating"]),
    }


def get_cart_id():
    raw_cart_id = request.headers.get("X-Cart-ID", "")
    try:
        return str(UUID(raw_cart_id))
    except ValueError:
        return None


def get_cart_summary(connection, cart_id):
    rows = connection.execute(
        """
        SELECT p.id, p.name, p.description, p.price, p.category, p.badge, p.stock,
               p.rating, p.review_count, p.image_url, c.quantity
        FROM cart_items AS c
        JOIN products AS p ON p.id = c.product_id
        WHERE c.cart_id = %s
        ORDER BY p.name
        """,
        (cart_id,),
    ).fetchall()
    items = [serialize_product(row) | {"quantity": row["quantity"]} for row in rows]
    subtotal = sum(
        (row["price"] * row["quantity"] for row in rows),
        Decimal("0.00"),
    )
    return {
        "items": items,
        "item_count": sum(item["quantity"] for item in items),
        "subtotal": float(subtotal),
    }


@app.get("/health")
def health():
    with get_connection() as connection:
        connection.execute("SELECT 1")
    return jsonify({"status": "ok", "service": "saleor-store-api", "database": "connected"}), 200


@app.get("/api/products")
def get_products():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM products ORDER BY id"
        ).fetchall()
    return jsonify([serialize_product(row) for row in rows]), 200


@app.get("/api/products/<product_id>")
def get_product(product_id):
    with get_connection() as connection:
        product = connection.execute(
            "SELECT * FROM products WHERE id = %s", (product_id,)
        ).fetchone()
    if product is None:
        return jsonify({"error": "Product not found."}), 404
    return jsonify(serialize_product(product)), 200


@app.get("/api/cart")
def get_cart():
    cart_id = get_cart_id()
    if cart_id is None:
        return jsonify({"error": "A valid X-Cart-ID header is required."}), 400
    with get_connection() as connection:
        return jsonify(get_cart_summary(connection, cart_id)), 200


@app.post("/api/cart")
def add_to_cart():
    cart_id = get_cart_id()
    if cart_id is None:
        return jsonify({"error": "A valid X-Cart-ID header is required."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    product_id = data.get("product_id")
    quantity = data.get("quantity", 1)
    if not isinstance(product_id, str) or not product_id:
        return jsonify({"error": "Product ID is required."}), 400
    if isinstance(quantity, bool) or not isinstance(quantity, int) or not 1 <= quantity <= 5:
        return jsonify({"error": "Quantity must be a whole number between 1 and 5."}), 400

    with get_connection() as connection:
        product = connection.execute(
            "SELECT stock FROM products WHERE id = %s", (product_id,)
        ).fetchone()
        if product is None:
            return jsonify({"error": "Product not found."}), 404
        if product["stock"] < quantity:
            return jsonify({"error": "That collectible is sold out or has too few pieces left."}), 409

        result = connection.execute(
            """
            INSERT INTO cart_items (cart_id, product_id, quantity)
            VALUES (%s, %s, %s)
            ON CONFLICT (cart_id, product_id) DO UPDATE
            SET quantity = cart_items.quantity + EXCLUDED.quantity
            WHERE cart_items.quantity + EXCLUDED.quantity <= 5
              AND cart_items.quantity + EXCLUDED.quantity <= (
                  SELECT stock FROM products WHERE id = EXCLUDED.product_id
              )
            RETURNING quantity
            """,
            (cart_id, product_id, quantity),
        ).fetchone()
        if result is None:
            return jsonify({"error": "The chest cannot hold more than 5, or more than the available stock, of one item."}), 409
        summary = get_cart_summary(connection, cart_id)
    return jsonify(summary), 201


@app.patch("/api/cart/<product_id>")
def update_cart_item(product_id):
    cart_id = get_cart_id()
    if cart_id is None:
        return jsonify({"error": "A valid X-Cart-ID header is required."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    quantity = data.get("quantity")
    if isinstance(quantity, bool) or not isinstance(quantity, int) or not 0 <= quantity <= 5:
        return jsonify({"error": "Quantity must be a whole number between 0 and 5."}), 400

    with get_connection() as connection:
        product = connection.execute(
            "SELECT stock FROM products WHERE id = %s", (product_id,)
        ).fetchone()
        if product is None:
            return jsonify({"error": "Product not found."}), 404
        if quantity > product["stock"]:
            return jsonify({"error": "That quantity is greater than the available stock."}), 409
        if quantity == 0:
            connection.execute(
                "DELETE FROM cart_items WHERE cart_id = %s AND product_id = %s",
                (cart_id, product_id),
            )
        else:
            connection.execute(
                """
                INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (%s, %s, %s)
                ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity
                """,
                (cart_id, product_id, quantity),
            )
        summary = get_cart_summary(connection, cart_id)
    return jsonify(summary), 200


@app.post("/api/orders")
def create_order():
    cart_id = get_cart_id()
    if cart_id is None:
        return jsonify({"error": "A valid X-Cart-ID header is required."}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    customer_name = data.get("name")
    email = data.get("email")
    shipping_address = data.get("address")
    if not isinstance(customer_name, str) or not 1 <= len(customer_name.strip()) <= 100:
        return jsonify({"error": "Enter your name (up to 100 characters)."}), 400
    if (
        not isinstance(email, str)
        or len(email) > 254
        or re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email.strip()) is None
    ):
        return jsonify({"error": "Enter a valid email address."}), 400
    if not isinstance(shipping_address, str) or not 5 <= len(shipping_address.strip()) <= 300:
        return jsonify({"error": "Enter a shipping address between 5 and 300 characters."}), 400

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT p.id, p.name, p.price, p.stock, c.quantity
            FROM cart_items AS c
            JOIN products AS p ON p.id = c.product_id
            WHERE c.cart_id = %s
            ORDER BY p.id
            FOR UPDATE OF c, p
            """,
            (cart_id,),
        ).fetchall()
        if not rows:
            return jsonify({"error": "Your hold is empty."}), 400
        for item in rows:
            if item["quantity"] > item["stock"]:
                return jsonify(
                    {
                        "error": (
                            f"Only {item['stock']} of {item['name']} remain. "
                            "Update your chest before checking out."
                        )
                    }
                ), 409

        total = sum(
            (row["price"] * row["quantity"] for row in rows),
            Decimal("0.00"),
        )
        order = connection.execute(
            """
            INSERT INTO orders (customer_name, email, shipping_address, cart_id, total)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (customer_name.strip(), email.strip(), shipping_address.strip(), cart_id, total),
        ).fetchone()
        for item in rows:
            connection.execute(
                """
                INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (order["id"], item["id"], item["name"], item["price"], item["quantity"]),
            )
            connection.execute(
                "UPDATE products SET stock = stock - %s WHERE id = %s",
                (item["quantity"], item["id"]),
            )
        connection.execute("DELETE FROM cart_items WHERE cart_id = %s", (cart_id,))
        updated_products = connection.execute(
            "SELECT * FROM products ORDER BY id"
        ).fetchall()

    return jsonify(
        {
            "order_id": order["id"],
            "total": float(total),
            "message": "Your demo order has been placed.",
            "products": [serialize_product(product) for product in updated_products],
        }
    ), 201


initialize_database()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
