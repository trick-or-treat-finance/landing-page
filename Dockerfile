FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Where "Sign in" / "See your month" point. Baked in at build time.
ARG VITE_APP_URL=http://localhost:5173/signin
ENV VITE_APP_URL=$VITE_APP_URL
RUN npx vite build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
