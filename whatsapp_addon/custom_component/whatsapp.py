import requests
from url_normalize import url_normalize

HOST = 'http://{{HOSTNAME}}:3000/'

class Whatsapp:
    def send_message(self, data):
        return requests.post(url_normalize(f'{HOST}/sendMessage'), json=data).content == 'OK'
