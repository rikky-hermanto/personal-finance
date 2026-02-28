FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL=http://localhost:7208

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Build the app with the API URL baked in
COPY index.html vite.config.ts tsconfig*.json tailwind.config.ts postcss.config.js components.json ./
COPY src/ src/
COPY public/ public/

ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Serve with nginx
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
