FROM nginx:latest

# Valores por defecto (sobrescribibles en despliegue vía docker-compose/.env)
ENV DEFAULT_LANGUAGE=English
ENV DEFAULT_SERVER_TYPE=Emby
ENV DEFAULT_SERVER_URL=""

COPY ./index.html /usr/share/nginx/html/index.html
COPY ./css /usr/share/nginx/html/css
COPY ./js /usr/share/nginx/html/js
COPY ./manifest.json /usr/share/nginx/html
COPY ./sw.js /usr/share/nginx/html
COPY ./icons /usr/share/nginx/html/icons
COPY ./backgrounds /usr/share/nginx/html/backgrounds
COPY ./config.js.template /usr/share/nginx/html/config.js.template
COPY ./docker-entrypoint.sh /docker-entrypoint-walkman.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint-walkman.sh"]
CMD ["nginx", "-g", "daemon off;"]
