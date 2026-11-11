FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json server.mjs ./
RUN --mount=type=secret,id=npm_ca \
    if [ -s /run/secrets/npm_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm ci --omit=dev; \
    else npm ci --omit=dev; fi \
    && rm -r /root/.npm \
    && mkdir -p /home/node/.local/state && chown -R node:node /home/node
USER node
EXPOSE 3200
# Retain the SDK's own state across container replacements. Never clear it to reset usage.
VOLUME ["/home/node/.local/state"]
CMD ["node", "server.mjs"]
