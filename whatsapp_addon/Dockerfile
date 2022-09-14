ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache git npm --repository=http://dl-cdn.alpinelinux.org/alpine/v3.10/main

COPY . /
RUN chmod a+x /run.sh
RUN chmod a+x /finish.sh

RUN cd / && npm install

EXPOSE 3000
CMD [ "/run.sh" ]