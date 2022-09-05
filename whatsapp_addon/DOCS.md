# Home Assistant Add-on: Whatsapp add-on

## How to use

### How to get a User ID
The user id is made from three parts:
- Country code (Example 39 (Italy))
- User's number
- And a static part: @c.us

For example for Italian number _3456789010_ the user id is the following _393456789010@c.us_

### Send a simple text message

```yaml
service: whatsapp.send_message
data:
  to: 393456789010@c.us # User ID
  body:
    type: text
    text: Hello World!
```

### How to send a media
```yaml
service: whatsapp.send_message
data:
  to: 393456789010@c.us # User ID
  body:
    type: media_url
    url: https://dummyimage.com/600x400/000/fff
```

### How to send a location
```yaml
service: whatsapp.send_message
data:
  to: 393456789010@c.us # User ID
  body:
    type: location
    latitude: 45.0903
    longitude: 34.07830
    description: New York City
```

---

## Sample automations

```yaml
- alias: Ping Pong
  description: ''
  trigger:
  - platform: event
    event_type: new-whatsapp-message
  condition:
  - condition: template
    value_template: '{{ trigger.event.data.body == ''!ping'' }}'
  action:
  - service: whatsapp.send_message
    data:
      to: '{{ trigger.event.data.from }}'
      body:
        type: text
        text: pong
  mode: single

```

```yaml
- alias: Arrive at home
  description: ''
  trigger:
  - platform: device
    domain: device_tracker
    entity_id: device_tracker.iphone_13_pro
    type: leaves
    zone: zone.home
  condition: []
  action:
  - service: whatsapp.send_message
    data:
      to: 393456789010@c.us
      body:
        type: text
        text: Sono a casa
  mode: single
```