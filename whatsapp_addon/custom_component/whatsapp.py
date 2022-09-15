import requests
from url_normalize import url_normalize

HOST = 'http://{{HOSTNAME}}:3000/'

class Whatsapp:
    def send_message(self, data):
        return requests.post(url_normalize(f'{HOST}/sendMessage'), json=data).content == 'OK'

    def set_status(self, data):
        return requests.post(url_normalize(f'{HOST}/setStatus'), json=data).content == 'OK'

    def presence_subscribe(self, data):
        return requests.post(url_normalize(f'{HOST}/presenceSubscribe'), json=data).content == 'OK'

    def send_presence_update(self, data):
        return requests.post(url_normalize(f'{HOST}/sendPresenceUpdate'), json=data).content == 'OK'
