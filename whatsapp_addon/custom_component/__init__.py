from __future__ import annotations

import logging

from .whatsapp import Whatsapp

from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers.typing import ConfigType

DOMAIN = "whatsapp"
_LOGGER = logging.getLogger(__name__)

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    whatsapp = Whatsapp()

    @callback
    async def send_message(call: ServiceCall) -> None:
        await hass.async_add_executor_job(whatsapp.send_message, call.data)

    @callback
    async def set_status(call: ServiceCall) -> None:
        await hass.async_add_executor_job(whatsapp.set_status, call.data)

    @callback
    async def presence_subscribe(call: ServiceCall) -> None:
        await hass.async_add_executor_job(whatsapp.presence_subscribe, call.data)

    @callback
    async def send_presence_update(call: ServiceCall) -> None:
        await hass.async_add_executor_job(whatsapp.send_presence_update, call.data)

    @callback
    async def send_infinity_presence_update(call: ServiceCall) -> None:
        await hass.async_add_executor_job(whatsapp.send_infinity_presence_update, call.data)

    hass.services.async_register(DOMAIN, 'send_message', send_message)
    hass.services.async_register(DOMAIN, 'set_status', set_status)
    hass.services.async_register(DOMAIN, 'presence_subscribe', presence_subscribe)
    hass.services.async_register(DOMAIN, 'send_presence_update', send_presence_update)
    hass.services.async_register(DOMAIN, 'send_infinity_presence_update', send_infinity_presence_update)

    return True