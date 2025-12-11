# backend/db.py

import os
from google.cloud.sql.connector import Connector, IPTypes
from sqlalchemy import text, create_engine
from sqlalchemy.pool import NullPool

# Read from Cloud Run environment variables
INSTANCE_CONNECTION_NAME = os.environ.get(
    "INSTANCE_CONNECTION_NAME",
    "just-smithy-479012-a1:us-east1:vento-postgres"
)

DB_USER = os.environ.get("DB_USER", "giorno_geovanna")
DB_PASS = os.environ.get("DB_PASS", "")
DB_NAME = os.environ.get("DB_NAME", "gold_experience")

# Internal singletons
_connector = None
_engine = None


# ------------------------------
# Connector Init
# ------------------------------
def _init_connector():
    global _connector
    if _connector is None:
        # PUBLIC IP is correct for Cloud Run + Cloud SQL
        _connector = Connector(ip_type=IPTypes.PUBLIC)
    return _connector


# ------------------------------
# Raw pg8000 connection
# ------------------------------
def get_raw_connection():
    """
    Legacy-style raw DB connection (pg8000) for code expecting .cursor().
    """
    conn = _init_connector().connect(
        INSTANCE_CONNECTION_NAME,
        "pg8000",
        user=DB_USER,
        password=DB_PASS,
        db=DB_NAME,
    )
    return conn


# ------------------------------
# SQLAlchemy Engine (recommended)
# ------------------------------
def get_engine():
    """
    SQLAlchemy Engine using the Cloud SQL Connector creator.
    NullPool is important for Cloud Run to avoid persistent sockets.
    """
    global _engine
    if _engine is None:

        def creator():
            return _init_connector().connect(
                INSTANCE_CONNECTION_NAME,
                "pg8000",
                user=DB_USER,
                password=DB_PASS,
                db=DB_NAME,
            )

        _engine = create_engine(
            "postgresql+pg8000://",
            creator=creator,
            poolclass=NullPool,
        )

    return _engine


# ------------------------------
# SQLAlchemy connection helper
# ------------------------------
def get_db_connection():
    """
    Returns an SQLAlchemy Connection.
    Caller must close() (or use with-statement).
    """
    return get_engine().connect()


# ------------------------------
# Execute helper
# ------------------------------
def execute_text(sql, params=None):
    """
    Convenience wrapper for quickly executing SQL text.
    """
    with get_db_connection() as conn:
        return conn.execute(text(sql), params or {})
