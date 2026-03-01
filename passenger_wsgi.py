import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(__file__))

from backend.main import app

def make_scope(environ):
    headers = []
    for key, value in environ.items():
        if key.startswith('HTTP_'):
            name = key[5:].lower().replace('_', '-').encode('latin-1')
            headers.append((name, value.encode('latin-1')))
    for key in ('CONTENT_TYPE', 'CONTENT_LENGTH'):
        value = environ.get(key, '')
        if value:
            headers.append((key.lower().replace('_', '-').encode('latin-1'), value.encode('latin-1')))
    return {
        'type': 'http',
        'asgi': {'version': '3.0'},
        'http_version': environ.get('SERVER_PROTOCOL', 'HTTP/1.1').split('/')[-1],
        'method': environ['REQUEST_METHOD'],
        'headers': headers,
        'path': environ.get('PATH_INFO', '/'),
        'query_string': environ.get('QUERY_STRING', '').encode('latin-1'),
        'root_path': environ.get('SCRIPT_NAME', ''),
        'server': (environ.get('SERVER_NAME', 'localhost'), int(environ.get('SERVER_PORT', 80))),
    }

STATUS_PHRASES = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed',
    422: 'Unprocessable Entity', 500: 'Internal Server Error',
}

async def run_asgi(scope, body):
    status_code = 500
    headers = []
    body_parts = []

    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}

    async def send(message):
        nonlocal status_code, headers
        if message['type'] == 'http.response.start':
            status_code = message['status']
            headers = message.get('headers', [])
        elif message['type'] == 'http.response.body':
            body_parts.append(message.get('body', b''))

    await app(scope, receive, send)
    return status_code, headers, b''.join(body_parts)

def application(environ, start_response):
    scope = make_scope(environ)
    body = environ['wsgi.input'].read()
    status_code, headers, body_bytes = asyncio.run(run_asgi(scope, body))
    status_str = f"{status_code} {STATUS_PHRASES.get(status_code, 'Unknown')}"
    response_headers = [(k.decode('latin-1'), v.decode('latin-1')) for k, v in headers]
    start_response(status_str, response_headers)
    return [body_bytes]
