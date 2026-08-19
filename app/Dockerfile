FROM node:22-alpine

# Use production node environment by default.
ENV NODE_ENV=production


WORKDIR /usr/src/app

# Install curl for Docker healthcheck
RUN apk add --no-cache curl

# Install dependencies first (leverages Docker layer cache)
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --verbose



# Copy the rest of the source files into the image.
COPY --chown=node:node . .

# Pre-create the audio-recordings mount point owned by node:node — the
# AUDIO_STORAGE_DIR volume doesn't otherwise exist in the image, so a fresh
# (or currently-empty) named volume mounted here would inherit Docker's
# default root:root ownership, which the non-root `node` user below can't
# write into (EACCES). Docker copies an image directory's contents —
# including ownership — into a volume mounted over it as long as the volume
# is empty at that moment, so this fixes it as soon as the volume is empty
# (as it is right now, since every write into it has been failing).
RUN mkdir -p /data/audio-recordings && chown -R node:node /data/audio-recordings

# Run the application as a non-root user.
USER node

# Expose the port that the application listens on.
EXPOSE 3000

# Run the application.
CMD ["npm", "run", "start"]
