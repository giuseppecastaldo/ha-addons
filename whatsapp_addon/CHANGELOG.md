## 1.2.2

- Added the ability to always be online or offline. This could lead to not receiving notifications on other devices. (**Restard required**)
- Bug fixed.

## 1.2.1

- Fixed bug that did not allow the reception of push notifications on other devices.
- Added event presence update.
- Added two more services like subscribe presence and send presence update.

## 1.2.0

- **Changed radically command and events. Please refer to doc and developer tools for change your automations.**
- **Performance boost! (Required re-authentication)**
- Bug fixed on send location.
- Bug fixed on send mulitple buttons.

## 1.1.2

- Bug fixed.
- Performance improvements.

## 1.1.1

- Migration from Home Assistant base image to Debian image

## 1.1.0

- Added the ability to manage multiple whatsapp sessions (re-authentication required)
- Buttons bug fixed (better visibility on android devices)
- Message options bug fixed
- Bug fixed.

**NOTE:** If you have problems with the custom components being updated, please follow this steps:

- Remove Whatsapp configuration in _configuration.yaml_
- Restart Home Assistant
- Add Whatsapp configuration in _configuration.yaml_
- Restart Home Assistant

## 1.0.2

- Addedd message revoke event.
- Added buttons message type (view documentation) (may not work properly on some devices)
- Added set status service (for sets the current user's status message)
- Bug fixed.

## 1.0.1

- Initial release
