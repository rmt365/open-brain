FROM denoland/deno:latest

# Install basic dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    curl \
    unzip \
    libblas3 liblapack3 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Create extensions directory
RUN mkdir -p /usr/local/lib/sqlite3/extensions

# Download pre-built sqlite-vss extension
# For vector similarity search
RUN curl -sSL https://github.com/asg017/sqlite-vss/releases/download/v0.1.2/sqlite-vss-v0.1.2-loadable-linux-x86_64.tar.gz \
    | tar -xzC /usr/local/lib/sqlite3/extensions/ vss0.so vector0.so \
    && chmod 755 /usr/local/lib/sqlite3/extensions/vss0.so /usr/local/lib/sqlite3/extensions/vector0.so \
    && chown deno:deno /usr/local/lib/sqlite3/extensions/vss0.so /usr/local/lib/sqlite3/extensions/vector0.so

# Set environment variables
ENV SQLITE_EXTENSION_PATH=/usr/local/lib/sqlite3/extensions
ENV SQLITE_VSS_PATH=/usr/local/lib/sqlite3/extensions/vss0
ENV SQLITE_VECTOR_PATH=/usr/local/lib/sqlite3/extensions/vector0

WORKDIR /app

# Copy vendored packages
COPY packages ./packages

# Copy service files
COPY deno.json .
COPY src ./src

# Cache dependencies
RUN deno cache --reload src/main.ts

# Pre-download SQLite FFI library to avoid runtime download issues
RUN mkdir -p /root/.cache/deno/plug/https/github.com/denodrivers/sqlite3/releases/download/0.12.0 && \
    curl -sSL -o /root/.cache/deno/plug/https/github.com/denodrivers/sqlite3/releases/download/0.12.0/libsqlite3.so \
    https://github.com/denodrivers/sqlite3/releases/download/0.12.0/libsqlite3.so

EXPOSE 3012

CMD ["deno", "run", "--config=deno.json", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-ffi", "src/main.ts"]
