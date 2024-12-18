# # Build stage
# FROM node:18-alpine AS builder

# # Set working directory
# WORKDIR /app

# # Copy package files
# COPY package*.json ./

# # Install dependencies
# RUN npm install

# # Copy all files
# COPY . .

# # Set build arguments
# ARG VITE_SUPABASE_URL
# ARG VITE_SUPABASE_ANON_KEY

# # Set environment variables
# ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
# ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# # Build the application
# RUN npm run build

# # Production stage
# FROM nginx:alpine

# # Copy built files
# COPY --from=builder /app/dist /usr/share/nginx/html

# # Copy nginx configuration
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# # Expose port
# EXPOSE 80

# # Start nginx
# CMD ["nginx", "-g", "daemon off;"]

# CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

# Don't copy node_modules or the rest of the code
# The volumes in docker-compose will handle that

COPY . .

EXPOSE 80

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]