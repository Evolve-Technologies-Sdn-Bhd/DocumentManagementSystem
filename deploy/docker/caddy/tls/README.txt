Place your manually-provisioned TLS cert & key here if you set TLS_MODE=manual.

Expected filenames (if you used ../generate-onprem-pki.sh):
  server-cert.pem    (server leaf + root CA, concatenated)
  server-key.pem     (ECDSA P-384 private key)

The entire folder is mounted read-only into the Caddy container at:
  /etc/caddy/tls
