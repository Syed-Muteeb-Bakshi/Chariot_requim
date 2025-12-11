# Use Python 3.10 Slim (Lightweight Linux)
FROM python:3.10-slim

# 1. Install System Dependencies
# We need 'build-essential' (gcc/g++) because Prophet/CmdStanPy needs to compile models.
# We remove 'libpq-dev' because we switched to 'pg8000' (pure Python), so we don't need C-libraries for Postgres.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Setup App Directory
WORKDIR /app

# 3. Copy Requirements & Install
# We copy this first to use Docker's cache speedup
COPY requirements.txt .

# Upgrade pip and install dependencies
# We use --no-cache-dir to keep the image small
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 4. Copy the Application Code
COPY . .

# 5. Configuration for Cloud Run
ENV PORT=8080
EXPOSE 8080

# 6. Start the Server
# "gunicorn" with 2 workers is good for a standard container
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "8", "--timeout", "0"]