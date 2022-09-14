# Home Assistant Add-on: Whatsapp add-on

## How to use

### **How to add other Whatsapp sessions**

Go to configuration page in clients input box digit the desired clientId. This one represents an identifier for the session.

### **How to get a User ID**

The user id is made from three parts:

- Country code (Example 39 (Italy))
- User's number
- And a static part: @s.whatsapp.net (for users) @g.us (for groups)

For example for Italian number _3456789010_ the user id is the following _393456789010@s.whatsapp.net_

### **Send a simple text message**

```yaml
service: whatsapp.send_message
data:
  clientId: default
  to: 391234567890@s.whatsapp.net # User ID
  body:
    text: Hi it's a simple text message
```

### **How to send an image**

```yaml
service: whatsapp.send_message
data:
  clientId: default
  to: 391234567890@s.whatsapp.net
  body:
    image:
      url: "https://dummyimage.com/600x400/000/fff.png"
    caption: Simple text
```

### **How to send audio message**

```yaml
service: whatsapp.send_message
data:
  clientId: default
  to: 391234567890@s.whatsapp.net
  body:
    audio:
      url: "https://github.com/giuseppecastaldo/ha-addons/blob/main/whatsapp_addon/examples/hello_world.mp3?raw=true"
    ptt: true # Send audio as a voice
```

### **How to send a location**

```yaml
service: whatsapp.send_message
data:
  clientId: default
  to: 391234567890@s.whatsapp.net
  body:
    location:
      degreesLatitude: 24.121231
      degreesLongitude: 55.1121221
```

### **How to send buttons**

```yaml
service: whatsapp.send_message
data:
  clientId: default
  to: 393456789012@s.whatsapp.net
  body:
    text: Hi it's a button message
    footer: Hello World
    buttons:
      - buttonText:
          displayText: Button 1
      - buttonText:
          displayText: Button 2
      - buttonText:
          displayText: Button 3
      - buttonText:
          displayText: Button 4
      - buttonText:
          displayText: Button 5
      - buttonText:
          displayText: Button 6
```

### **How to send list**

```yaml
service: whatsapp.send_message
data:
  clientId: default
  to: 391234567890@s.whatsapp.net
  body:
    text: This is a list
    footer: "Footer"
    title: Amazing boldfaced list title
    buttonText: "Required, text on the button to view the list"
    sections:
      - title: Section 1
        rows:
          - title: Option 1
            rowId: option1
          - title: Option 2
            rowId: option2
            description: This is a description
      - title: Section 2
        rows:
          - title: Option 3
            rowId: option3
          - title: Option 4
            rowId: option4
            description: This is another description
```

### **How to send list (Android devices only)**

```yaml
service: whatsapp.send_message
data:
  clientId: default
  to: 391234567890@s.whatsapp.net
  body:
    text: Hi it's a template message
    footer: Hello World
    templateButtons:
      - index: 1
        urlButton:
          displayText: ⭐ Star Whatsapp addon on GitHub!
          url: "https://github.com/giuseppecastaldo/ha-addons/tree/main/whatsapp_addon"
      - index: 2
        callButton:
          displayText: Call me!
          phoneNumber: +1 (234) 5678-901
      - index: 3
        quickReplyButton:
          displayText: "This is a reply, just like normal buttons!"
          id: id-like-buttons-message
```

---

## Events

| Event type           | Description                   |
| -------------------- | ----------------------------- |
| new_whatsapp_message | The message that was received |

---

## **Sample automations**

```yaml
- alias: Ping Pong
  description: ""
  trigger:
    - platform: event
      event_type: new_whatsapp_message
  condition:
    - condition: template
      value_template: "{{ trigger.event.data.message.conversation == '!ping' }}"
  action:
    - service: whatsapp.send_message
      data:
        clientId: default
        to: "{{ trigger.event.data.key.remoteJid }}"
        body:
          text: pong
  mode: single
```

```yaml
- alias: Arrive at home
  description: ""
  trigger:
    - platform: device
      domain: device_tracker
      entity_id: device_tracker.iphone_13_pro
      type: enter
      zone: zone.home
  condition: []
  action:
    - service: whatsapp.send_message
      data:
        clientId: default
        to: 391234567890@s.whatsapp.net
        body:
          text: Hi, I'm at home
  mode: single
```

```yaml
- alias: Driving mode
  description: ""
  trigger:
    - platform: event
      event_type: new_whatsapp_message
  condition: []
  action:
    - service: whatsapp.send_message
      data:
        clientId: "{{ trigger.event.data.clientId }}" # Which instance of whatsapp should the message come from
        to: "{{ trigger.event.data.key.remoteJid }}"
        body:
          text: Sorry, I'm driving, I will contact you soon
  mode: single
```
