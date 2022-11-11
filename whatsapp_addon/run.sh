#!/usr/bin/with-contenv bashio
set +u

sed -i "s/{{HOSTNAME}}/$HOSTNAME/g" custom_component/whatsapp.py

mkdir -p config/custom_components/whatsapp
cp --recursive /custom_component/* config/custom_components/whatsapp/
bashio::log.info "Installed custom component."

node index