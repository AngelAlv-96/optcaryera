#!/usr/bin/env python3
"""
ZPL Bridge — Car & Era
Recibe ZPL del sistema web y lo manda directo a la impresora via win32print RAW.
Instalar: python C:\ZPL\zpl_bridge.py install
Correr:   python C:\ZPL\zpl_bridge.py run
"""
import sys, os, json, ssl, subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT      = 9200
CERT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zpl_cert.pem')
KEY_FILE  = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zpl_key.pem')

def get_printer():
    import win32print
    printers = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    doras = [p for p in printers if 'dora' in p.lower()]
    if doras:
        # Preferir Copiar 1
        c1 = [p for p in doras if 'copiar 1' in p.lower()]
        return c1[0] if c1 else doras[0]
    return win32print.GetDefaultPrinter()

def print_raw(zpl, printer_name):
    import win32print
    h = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(h, 1, ('Label', None, 'RAW'))
        try:
            win32print.StartPagePrinter(h)
            win32print.WritePrinter(h, zpl.encode('ascii', errors='replace'))
            win32print.EndPagePrinter(h)
        finally:
            win32print.EndDocPrinter(h)
    finally:
        win32print.ClosePrinter(h)

def gen_cert():
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime, ipaddress
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'ZPL Bridge')])
        cert = (x509.CertificateBuilder()
            .subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.now(datetime.UTC))
            .not_valid_after(datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=3650))
            .add_extension(x509.SubjectAlternativeName([
                x509.DNSName('localhost'),
                x509.IPAddress(ipaddress.IPv4Address('127.0.0.1'))
            ]), critical=False)
            .sign(key, hashes.SHA256()))
        with open(KEY_FILE, 'wb') as f:
            f.write(key.private_bytes(serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption()))
        with open(CERT_FILE, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        print('Certificado generado')
    except Exception as e:
        print('Sin cert SSL:', e)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_GET(self):
        try:
            printer = get_printer()
            self._ok({'ok': True, 'port': PORT, 'printer': printer})
        except Exception as e:
            self._ok({'ok': False, 'error': str(e)})

    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n))
            # Usar ZPL directo que viene del sistema
            zpl = body.get('zpl', '')
            if not zpl:
                self._err('zpl requerido'); return
            printer = get_printer()
            print('Imprimiendo en:', printer)
            print('ZPL:', repr(zpl[:80]))
            print_raw(zpl, printer)
            self._ok({'ok': True, 'printer': printer})
        except Exception as e:
            import traceback
            print('ERROR:', traceback.format_exc())
            self._err(str(e))

    def _ok(self, d):
        b = json.dumps(d).encode()
        self.send_response(200); self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def _err(self, msg):
        b = json.dumps({'error': msg}).encode()
        self.send_response(500); self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

def run_server():
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    # HTTP only — localhost is always a secure context in Chrome/Edge
    # HTTPS with self-signed cert caused "sitio no seguro" warning
    # which broke SpeechRecognition API (requires secure context)
    print(f'ZPL Bridge corriendo en http://localhost:{PORT}')
    server.serve_forever()

def install_service():
    script = os.path.abspath(__file__)
    python = sys.executable
    xml = f'''<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Hidden>true</Hidden></Settings>
  <Actions><Exec>
    <Command>{python}</Command>
    <Arguments>"{script}" run</Arguments>
    <WorkingDirectory>{os.path.dirname(script)}</WorkingDirectory>
  </Exec></Actions>
</Task>'''
    tmp = os.path.join(os.environ.get('TEMP','C:\\Temp'), 'zpl_task.xml')
    with open(tmp, 'w', encoding='utf-16') as f: f.write(xml)
    r = subprocess.run(['schtasks','/Create','/TN','ZPL Bridge Car Era','/XML',tmp,'/F'],
                       capture_output=True, text=True)
    if r.returncode == 0:
        print('Tarea instalada')
        subprocess.run(['schtasks','/Run','/TN','ZPL Bridge Car Era'])
    else:
        print('Error:', r.stderr)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'run'
    if   cmd == 'install':   install_service()
    elif cmd == 'uninstall': subprocess.run(['schtasks','/Delete','/TN','ZPL Bridge Car Era','/F'])
    elif cmd == 'run':       run_server()
