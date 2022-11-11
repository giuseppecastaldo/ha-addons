ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache git npm

COPY . /
RUN chmod a+x /run.sh
RUN chmod a+x /finish.sh

RUN cd / && npm install -f

EXPOSE 3000
CMD [ "/run.sh" ]