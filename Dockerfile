# Static marketing site for Medical X Scottsdale, served by nginx.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

# nginx.conf must stay in the build context for the COPY above to find it, so
# it gets stripped from the served root here rather than via .dockerignore.
RUN rm -f /usr/share/nginx/html/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/health || exit 1
