ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.2.1
FROM ${BUILD_FROM}

RUN apk add --no-cache git npm

COPY . /
RUN chmod a+x /run.sh
RUN chmod a+x /finish.sh

RUN cd /Baileys && npm i -f && cd .. && npm install -f

EXPOSE 3000
CMD [ "/run.sh" ]