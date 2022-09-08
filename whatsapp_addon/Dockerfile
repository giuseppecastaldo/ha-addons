ARG BUILD_FROM
FROM $BUILD_FROM

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN apt install curl \
    && curl -sL https://deb.nodesource.com/setup_18.x | bash - \
    && apt update \
    && apt install nodejs \
    && apt install -y chromium git build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

COPY . /
RUN chmod a+x /run.sh
RUN chmod a+x /finish.sh

RUN cd / && npm install
RUN npm install github:pedroslopez/whatsapp-web.js#fix-buttons-list

EXPOSE 3000
CMD [ "/run.sh" ]