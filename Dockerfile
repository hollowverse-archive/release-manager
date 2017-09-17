FROM node:latest

ENV NODE_ENV=production

EXPOSE 8080

# Set working directory to project root so
# all the following commands are run relative to
# it
WORKDIR /release-manager

# Copy runtime secrets
COPY ./secrets/ ./secrets/

# Copy environment file, generated at build time by deploy.js
COPY ./env.json ./

# Install production dependencies
COPY package.json yarn.lock ./
RUN yarn --prod

COPY ./dist ./dist/

CMD yarn start
