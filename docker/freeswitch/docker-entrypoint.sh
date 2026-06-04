#!/bin/bash
# docker-entrypoint.sh — substitute ESL_PASSWORD into the ESL config template
# then exec the FreeSWITCH process.
set -e

ESL_PASSWORD="${ESL_PASSWORD:-ClueCon}"

# Warn loudly if the default password is still in use — it should be changed
# before exposing port 8021 outside the Docker network.
if [ "${ESL_PASSWORD}" = "ClueCon" ]; then
    echo "[freeswitch] WARNING: ESL password is the default 'ClueCon'." >&2
    echo "[freeswitch] Set FREESWITCH_ESL_PASSWORD in your .env for production." >&2
fi

# Inject ESL_PASSWORD into the event_socket config template.
envsubst '${ESL_PASSWORD}' \
    < /etc/freeswitch/autoload_configs/event_socket.conf.xml.tpl \
    > /etc/freeswitch/autoload_configs/event_socket.conf.xml

echo "[freeswitch] ESL configured on 0.0.0.0:8021" >&2

exec "$@"
