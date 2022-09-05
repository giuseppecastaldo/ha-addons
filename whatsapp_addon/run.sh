#!/usr/bin/with-contenv bashio
set +u

mkdir -p config/custom_components/whatsapp
cp --recursive /custom_component/* config/custom_components/whatsapp/
bashio::log.info "Installed custom component."

node ./index.js