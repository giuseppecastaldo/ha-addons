#!/usr/bin/with-contenv bashio

rm -rf config/custom_components/whatsapp

if [ -z "$(ls -A config/custom_components)" ]; then
   rm -rf config/custom_components
fi

bashio::log.info "Uninstalled custom component."