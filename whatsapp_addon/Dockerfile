ARG BUILD_FROM
FROM $BUILD_FROM

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN apk add --update npm chromium

COPY . /
RUN chmod a+x /run.sh
RUN chmod a+x /finish.sh

RUN cd / && npm install --unsafe-perm

RUN npm install

EXPOSE 3000
CMD [ "/run.sh" ]