FROM nginx:alpine
COPY site /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  location / {\n    root /usr/share/nginx/html;\n    index index.html;\n    add_header Cache-Control "no-cache, no-store, must-revalidate";\n    add_header Pragma "no-cache";\n    add_header Expires "0";\n  }\n}\n' > /etc/nginx/conf.d/default.conf
