FROM python:3.12-alpine

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install git for commit tracking + allow foreign-owned repos
RUN apk add --no-cache git && \
    git config --global --add safe.directory '*'

# Copy collector scripts
COPY . .

# Entrypoint: dump runtime env → cron can source it, then start crond
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
